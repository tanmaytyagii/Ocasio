import { betterAuth } from 'better-auth';
import { toNodeHandler, fromNodeHeaders } from 'better-auth/node';
import { encryptMail } from '@ocasio/database';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { Environment } from '@ocasio/contracts';
export function createAuthRuntime(pool:Pool, config:Environment) {
  const queue=async(to:string,subject:string,text:string)=>{await pool.query('INSERT INTO auth_mail_queue (id, encrypted_payload) VALUES ($1,$2)',[randomUUID(),encryptMail({to,subject,text},config.SESSION_SECRET)]);};
  const auth=betterAuth({
    database:pool, secret:config.SESSION_SECRET, baseURL:config.WEB_ORIGIN, basePath:'/api/v1/auth', trustedOrigins:[config.WEB_ORIGIN],
    user:{modelName:'auth_users'},session:{modelName:'auth_sessions'},account:{modelName:'auth_accounts',accountLinking:{enabled:false}},verification:{modelName:'auth_verifications'},
    emailAndPassword:{enabled:true,requireEmailVerification:true,minPasswordLength:12,maxPasswordLength:128,autoSignIn:false,revokeSessionsOnPasswordReset:true,sendResetPassword:async({user,url})=>queue(user.email,'Reset your Ocasio password',`Reset your password: ${url}`)},
    emailVerification:{sendOnSignUp:true,autoSignInAfterVerification:false,sendVerificationEmail:async({user,url})=>queue(user.email,'Verify your Ocasio email',`Verify your email: ${url}`)},
    socialProviders:config.GOOGLE_CLIENT_ID&&config.GOOGLE_CLIENT_SECRET?{google:{clientId:config.GOOGLE_CLIENT_ID,clientSecret:config.GOOGLE_CLIENT_SECRET}}:{},
    advanced:{useSecureCookies:config.NODE_ENV==='production'},logger:{disabled:true},
    rateLimit:{enabled:true,storage:'database',modelName:'auth_rate_limits'},
  });
  return {auth,handler:toNodeHandler(auth),getSession:(headers:Parameters<typeof fromNodeHeaders>[0])=>auth.api.getSession({headers:fromNodeHeaders(headers)}),signOut:(headers:Parameters<typeof fromNodeHeaders>[0])=>auth.api.signOut({headers:fromNodeHeaders(headers),asResponse:true})};
}
