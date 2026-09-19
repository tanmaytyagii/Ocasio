import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        // Where to land is decided by the database-backed role, not by a form
        // toggle. Return the user wherever they were headed, or home.
        const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname;
        navigate(from ?? '/', { replace: true });
      } else {
        // No role in metadata. handle_new_user() always provisions
        // role='customer'; becoming a vendor goes through onboarding review.
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setError('Please check your email for verification.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-canvas flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h1 className="mb-2 text-center">
          <Link to="/" className="text-display-sm font-semibold text-brand-700">
            Ocasio
          </Link>
        </h1>
        <p className="mb-8 text-center text-muted">
          Find the perfect vendors for your special occasions
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          {!isLogin && (
            <div className="mb-6 rounded-lg border border-line bg-canvas p-4 text-sm text-muted">
              <p>
                Every account starts as a customer account. To list a business, create an
                account and then apply through{' '}
                <Link to="/become-vendor" className="font-medium text-brand-700 hover:underline">
                  Become a vendor
                </Link>
                . Vendor listings go live after review.
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-ink-soft">
                Email address
              </label>
              <div className="mt-1">
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="appearance-none block w-full px-3 py-2 border border-line-strong rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-purple-500 focus:border-brand-500"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-ink-soft">
                Password
              </label>
              <div className="mt-1">
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="appearance-none block w-full px-3 py-2 border border-line-strong rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-purple-500 focus:border-brand-500"
                />
              </div>
            </div>

            {error && (
              <div className="text-sm text-red-600">
                {error}
              </div>
            )}

            <div>
              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
              >
                {loading ? 'Loading...' : isLogin ? 'Sign in' : 'Sign up'}
              </button>
            </div>
          </form>

          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-line-strong" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-muted">
                  {isLogin ? "Don't have an account?" : "Already have an account?"}
                </span>
              </div>
            </div>

            <div className="mt-6">
              <button
                onClick={() => setIsLogin(!isLogin)}
                className="w-full flex justify-center py-2 px-4 border border-purple-300 rounded-md shadow-sm text-sm font-medium text-brand-700 bg-white hover:bg-canvas focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
              >
                {isLogin ? 'Create new account' : 'Log in'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Auth;