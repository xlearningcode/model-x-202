import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/db/supabase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle, XCircle, Mail } from 'lucide-react';

type Status = 'loading' | 'success' | 'error';

const ConfirmEmail: React.FC = () => {
  const [status, setStatus] = useState<Status>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        setStatus('success');
        setTimeout(() => navigate('/chat'), 2500);
      }
    });

    // Also check hash for error params
    const hash = window.location.hash;
    if (hash.includes('error=')) {
      const params = new URLSearchParams(hash.replace('#', '?'));
      setErrorMsg(params.get('error_description') || 'Email confirmation failed');
      setStatus('error');
    }

    return () => subscription.unsubscribe();
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
            {status === 'loading' && <Mail className="h-6 w-6 text-primary-foreground" />}
            {status === 'success' && <CheckCircle className="h-6 w-6 text-primary-foreground" />}
            {status === 'error' && <XCircle className="h-6 w-6 text-primary-foreground" />}
          </div>
          <CardTitle className="text-2xl">
            {status === 'loading' && 'Confirming Email…'}
            {status === 'success' && 'Email Confirmed!'}
            {status === 'error' && 'Confirmation Failed'}
          </CardTitle>
          <CardDescription>
            {status === 'loading' && 'Please wait while we verify your email address.'}
            {status === 'success' && 'Your email is confirmed. Redirecting to the app…'}
            {status === 'error' && (errorMsg || 'Something went wrong with the confirmation link.')}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
          {status === 'loading' && <Loader2 className="h-8 w-8 animate-spin text-primary" />}
          {status === 'success' && (
            <div className="w-full rounded-lg bg-primary/10 p-4 text-center text-sm text-primary font-medium">
              ✓ Account verified successfully
            </div>
          )}
          {status === 'error' && (
            <Link to="/">
              <Button>Back to Sign In</Button>
            </Link>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ConfirmEmail;
