import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import {
  ArgumentsHost, Catch, Controller, DynamicModule, ExceptionFilter, Get,
  HttpException, Inject, Injectable, Logger, Module, OnApplicationShutdown,
  Query, ServiceUnavailableException, ValidationPipe,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ApiProperty, ApiPropertyOptional, ApiResponse, DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';
import helmet from 'helmet';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { json, urlencoded, type Request, type Response, type NextFunction } from 'express';
import { CoverageResponseSchema, type Environment } from '@ocasio/contracts';
import { createPool, environment } from '@ocasio/database';
import { CsrfGuard, SessionController, sessionCookieName, sessionCookieOptions } from './security';

const CONFIG = Symbol('CONFIG');
type TrackedRequest = Request & { requestId: string };

@Injectable()
class DatabaseService implements OnApplicationShutdown {
  readonly pool;
  readonly sessions;
  constructor(@Inject(CONFIG) config: Environment) {
    this.pool = createPool(config.DATABASE_URL);
    this.pool.on('error', () => Logger.error('Idle database connection failed', 'Database'));
    const PgSessionStore = connectPgSimple(session);
    this.sessions = new PgSessionStore({pool:this.pool,tableName:'app_sessions',createTableIfMissing:false,pruneSessionInterval:60,errorLog:() => Logger.error('Session storage unavailable','Sessions')});
  }
  async onApplicationShutdown() { await this.sessions.close(); await this.pool.end(); }
}

class CoverageQuery {
  @ApiPropertyOptional({type: Number, minimum:1, maximum:20, default:20})
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit = 20;
}

class MarketDto {
  @ApiProperty({format:'uuid'}) id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() name!: string;
  @ApiProperty({enum:['research']}) mode!: 'research';
}
class CoverageDto {
  @ApiProperty({type:[MarketDto]}) items!: MarketDto[];
}

@Controller()
class FoundationController {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  @Get('health/live')
  live() { return {status:'ok', service:'ocasio-api'}; }

  @Get('health/ready')
  async ready() {
    try {
      // Readiness includes schema accessibility, not only a listening process.
      await this.db.pool.query('SELECT id FROM coverage_markets LIMIT 1');
      await this.db.pool.query('SELECT sid FROM app_sessions LIMIT 1');
      return {status:'ready', database:'connected'};
    } catch {
      throw new ServiceUnavailableException('Database is not ready');
    }
  }

  @Get('coverage')
  @ApiResponse({status:200,type:CoverageDto})
  @ApiResponse({status:503,description:'Database unavailable'})
  async coverage(@Query() query: CoverageQuery) {
    try {
      const result = await this.db.pool.query(
        `SELECT id, slug, name, mode FROM coverage_markets ORDER BY sort_order, slug LIMIT $1`, [query.limit],
      );
      return CoverageResponseSchema.parse({items:result.rows});
    } catch {
      throw new ServiceUnavailableException('Coverage could not be loaded');
    }
  }
}

@Catch()
class SafeExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const req = http.getRequest<TrackedRequest>();
    const res = http.getResponse<Response>();
    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    const errors: Record<number, [string,string]> = {
      400:['VALIDATION_FAILED','Check the request fields and try again.'],
      401:['AUTHENTICATION_REQUIRED','Please sign in to continue.'],
      403:['REQUEST_FORBIDDEN','This request could not be verified. Refresh and try again.'],
      404:['NOT_FOUND','This resource was not found.'],
      503:['SERVICE_UNAVAILABLE','This service is temporarily unavailable. Please try again.'],
    };
    const [code,message] = errors[status] ?? ['INTERNAL_ERROR','The request could not be completed.'];
    if (status >= 500) Logger.error(JSON.stringify({event:'request.failed',requestId:req.requestId,status}), 'API');
    res.status(status).json({error:{code,message,requestId:req.requestId}});
  }
}

@Module({})
class AppModule {
  static register(config: Environment): DynamicModule {
    return {module:AppModule,controllers:[FoundationController,SessionController],providers:[{provide:CONFIG,useValue:config},DatabaseService]};
  }
}

export async function createApplication(config = environment(), quiet = false) {
  const app = await NestFactory.create(AppModule.register(config), {bodyParser:false,logger:quiet ? false : ['error','warn','log']});
  app.setGlobalPrefix('api/v1');
  app.use(helmet());
  app.enableCors({origin:config.WEB_ORIGIN, methods:['GET','HEAD','POST','PUT','PATCH','DELETE'],allowedHeaders:['Content-Type','X-CSRF-Token'],credentials:true});
  app.use((req:TrackedRequest,res:Response,next:NextFunction) => {
    req.requestId = randomUUID();
    res.setHeader('X-Request-Id',req.requestId);
    res.setHeader('Cache-Control','no-store');
    const start = performance.now();
    res.on('finish', () => {
      if (!quiet) Logger.log(JSON.stringify({event:'request.finished',requestId:req.requestId,method:req.method,status:res.statusCode,durationMs:Math.round(performance.now()-start)}), 'HTTP');
    });
    next();
  });
  app.getHttpAdapter().getInstance().locals.ocasioProduction = config.NODE_ENV === 'production';
  app.use(session({
    name:sessionCookieName(config),secret:config.SESSION_SECRET,store:app.get(DatabaseService).sessions,
    resave:false,saveUninitialized:false,rolling:false,
    cookie:{...sessionCookieOptions(config),maxAge:config.SESSION_TTL_MINUTES*60*1000},
  }));
  app.use((error:unknown,req:TrackedRequest,res:Response,_next:NextFunction) => {
    if (!error) return _next();
    Logger.error(JSON.stringify({event:'session.unavailable',requestId:req.requestId}),'Sessions');
    res.status(503).json({error:{code:'SERVICE_UNAVAILABLE',message:'This service is temporarily unavailable. Please try again.',requestId:req.requestId}});
  });
  const runtime = (await import('./auth.mjs')).createAuthRuntime(app.get(DatabaseService).pool,config);
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.locals.ocasioAuth = runtime;
  app.use('/api/v1/auth', (req:Request,res:Response,next:NextFunction) => {
    try { new CsrfGuard(config.WEB_ORIGIN).check(req); }
    catch { res.status(403).json({error:{code:'REQUEST_FORBIDDEN',message:'Refresh and try again.'}}); return; }
    void Promise.resolve(runtime.handler(req,res)).catch(() => { if(!res.headersSent) res.status(503).json({error:{code:'SERVICE_UNAVAILABLE',message:'Please try again.'}}); });
  });
  app.use(json({limit:'32kb'}));
  app.use(urlencoded({extended:false,limit:'32kb'}));
  expressApp.get('/api/v1/auth-options', (_req:Request,res:Response) => res.json({emailPassword:true,google:Boolean(config.GOOGLE_CLIENT_ID&&config.GOOGLE_CLIENT_SECRET),localEmailInbox:config.NODE_ENV!=='production'&&['127.0.0.1','localhost'].includes(config.SMTP_HOST)}));
  expressApp.get('/api/v1/me', async(req:Request,res:Response) => {
    try {const result=await runtime.getSession(req.headers); if(!result) {res.status(401).json({error:{code:'AUTHENTICATION_REQUIRED'}});return;} if(!result.user.emailVerified){res.status(403).json({error:{code:'EMAIL_VERIFICATION_REQUIRED'}});return;}
      const {id,name,email,emailVerified}=result.user; res.json({user:{id,name,email,emailVerified}});
    } catch {res.status(503).json({error:{code:'SERVICE_UNAVAILABLE'}});}
  });
  app.useGlobalGuards(new CsrfGuard(config.WEB_ORIGIN));
  app.useGlobalPipes(new ValidationPipe({transform:true,whitelist:true,forbidNonWhitelisted:true,forbidUnknownValues:true}));
  app.useGlobalFilters(new SafeExceptionFilter());
  if (config.NODE_ENV !== 'production') {
    const schema = SwaggerModule.createDocument(app,new DocumentBuilder().setTitle('Ocasio foundation API').setVersion('0.0.2').setDescription('Coverage, account identity and browser security. Booking and payment endpoints are pending.').build());
    SwaggerModule.setup('api/docs',app,schema);
  }
  app.enableShutdownHooks();
  return app;
}
