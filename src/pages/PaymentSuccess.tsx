import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { CheckCircle2, Loader2, XCircle, Sparkles } from 'lucide-react';

const functionsBaseUrl = import.meta.env.VITE_FUNCTIONS_BASE_URL;

type VerifyState = 'loading' | 'success' | 'failed';

const PaymentSuccess: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [state, setState] = useState<VerifyState>('loading');
  const [plan, setPlan] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const sessionId = searchParams.get('session_id');
    if (!sessionId) {
      setState('failed');
      return;
    }
    verifyPayment(sessionId);
  }, []);

  const verifyPayment = async (sessionId: string) => {
    try {
      const res = await fetch(`${functionsBaseUrl}/functions/v1/verify-stripe-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });
      const json = await res.json();

      if (json.code === 'SUCCESS' && json.data?.verified) {
        setState('success');
        setPlan(json.data.plan);
        setEmail(json.data.customerEmail);
        toast.success('Subscription activated!');
      } else {
        setState('failed');
        toast.error('Payment verification failed');
      }
    } catch {
      setState('failed');
      toast.error('Could not verify payment');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
            <Sparkles className="h-6 w-6 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl">
            {state === 'loading' ? 'Verifying Payment...' : state === 'success' ? 'Payment Successful!' : 'Verification Failed'}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-6 text-center">
          {state === 'loading' && (
            <div className="flex flex-col items-center gap-3 py-4">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Please wait while we confirm your payment...</p>
            </div>
          )}

          {state === 'success' && (
            <>
              <CheckCircle2 className="h-16 w-16 text-green-500" />
              <div className="space-y-1">
                <p className="text-base font-medium">
                  Your{' '}
                  <span className="capitalize font-semibold text-primary">
                    {plan ? `Pro ${plan}` : 'Pro'}
                  </span>{' '}
                  subscription is now active!
                </p>
                {email && <p className="text-sm text-muted-foreground">Confirmation sent to {email}</p>}
              </div>
              <div className="flex w-full flex-col gap-2">
                <Button className="w-full" onClick={() => navigate('/chat')}>
                  Start Chatting
                </Button>
                <Button variant="outline" className="w-full" onClick={() => navigate('/profile')}>
                  View Profile
                </Button>
              </div>
            </>
          )}

          {state === 'failed' && (
            <>
              <XCircle className="h-16 w-16 text-destructive" />
              <div className="space-y-1">
                <p className="text-base font-medium">We couldn't verify your payment.</p>
                <p className="text-sm text-muted-foreground">
                  If you were charged, please contact support. Otherwise, try again.
                </p>
              </div>
              <div className="flex w-full flex-col gap-2">
                <Button className="w-full" onClick={() => navigate('/pricing')}>
                  Try Again
                </Button>
                <Button variant="outline" className="w-full" onClick={() => navigate('/chat')}>
                  Back to Chat
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default PaymentSuccess;
