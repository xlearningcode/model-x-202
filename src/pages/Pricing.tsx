import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/db/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Check, Sparkles, Loader2, ArrowLeft, Zap, Crown } from 'lucide-react';

const functionsBaseUrl = import.meta.env.VITE_FUNCTIONS_BASE_URL;

interface Subscription {
  plan: 'free' | 'monthly' | 'yearly';
  status: string;
  current_period_end: string | null;
}

const PLANS = [
  {
    id: 'free',
    name: 'Free',
    price: '$0',
    period: 'forever',
    icon: Sparkles,
    description: 'Get started with basic AI features',
    features: [
      '50 messages per day',
      '3 image generations per day',
      'Basic text chat',
      'Standard response speed',
      'Community support',
    ],
    cta: 'Current Plan',
    highlight: false,
  },
  {
    id: 'monthly',
    name: 'Pro Monthly',
    price: '$9.99',
    period: 'per month',
    icon: Zap,
    description: 'Full access with monthly flexibility',
    features: [
      'Unlimited messages',
      'Unlimited image generation',
      'Priority response speed',
      'Video generation (Kling)',
      'AI Search with web access',
      'Speech-to-text & TTS',
      'Priority support',
    ],
    cta: 'Subscribe Monthly',
    highlight: false,
  },
  {
    id: 'yearly',
    name: 'Pro Yearly',
    price: '$79.99',
    period: 'per year',
    icon: Crown,
    description: 'Best value — save 33% vs monthly',
    features: [
      'Everything in Pro Monthly',
      'Unlimited messages & images',
      '2 months free',
      'Early access to new features',
      'Dedicated support',
      'Usage analytics',
      'API access (coming soon)',
    ],
    cta: 'Subscribe Yearly',
    highlight: true,
    badge: 'Best Value',
  },
];

const Pricing: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [loadingSub, setLoadingSub] = useState(true);

  useEffect(() => {
    if (!user) {
      navigate('/');
      return;
    }
    loadSubscription();
  }, [user]);

  const loadSubscription = async () => {
    try {
      const { data } = await supabase
        .from('subscriptions')
        .select('plan, status, current_period_end')
        .eq('user_id', user!.id)
        .single();
      setSubscription(data);
    } catch {
      // No subscription yet = free
    } finally {
      setLoadingSub(false);
    }
  };

  const handleSubscribe = async (planId: string) => {
    if (planId === 'free') return;
    if (!user) { navigate('/'); return; }

    setLoadingPlan(planId);
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      const res = await fetch(`${functionsBaseUrl}/functions/v1/create-stripe-checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ plan: planId }),
      });
      const json = await res.json();

      if (json.code !== 'SUCCESS' || !json.data?.url) {
        throw new Error(json.message || 'Failed to create checkout session');
      }
      window.open(json.data.url, '_blank');
    } catch (err: any) {
      toast.error(err.message || 'Payment setup failed');
    } finally {
      setLoadingPlan(null);
    }
  };

  const currentPlan = subscription?.plan ?? 'free';
  const isActive = subscription?.status === 'active';

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card/50 px-4 py-3">
        <div className="mx-auto flex max-w-5xl items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/chat')} className="h-9 w-9">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary">
              <Sparkles className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-semibold">Model-x-202 Pricing</span>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 py-12">
        {/* Hero */}
        <div className="mb-12 text-center">
          <h1 className="mb-3 text-3xl font-bold text-balance md:text-4xl">
            Unlock the Full Power of AI
          </h1>
          <p className="text-muted-foreground text-pretty md:text-lg">
            Upgrade for unlimited chat, image generation, video creation, and more.
          </p>
          {!loadingSub && currentPlan !== 'free' && isActive && (
            <Badge variant="secondary" className="mt-4">
              <Crown className="mr-1 h-3 w-3" />
              You're on the {currentPlan} plan
              {subscription?.current_period_end && (
                <span className="ml-1 opacity-70">
                  · renews {new Date(subscription.current_period_end).toLocaleDateString()}
                </span>
              )}
            </Badge>
          )}
        </div>

        {/* Plans grid */}
        <div className="grid gap-6 md:grid-cols-3">
          {PLANS.map((plan) => {
            const Icon = plan.icon;
            const isCurrent = currentPlan === plan.id && isActive;
            const isLoading = loadingPlan === plan.id;

            return (
              <Card
                key={plan.id}
                className={`relative flex h-full flex-col transition-shadow ${
                  plan.highlight
                    ? 'border-primary shadow-lg ring-2 ring-primary/30'
                    : 'hover:shadow-md'
                }`}
              >
                {plan.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-primary text-primary-foreground px-3 py-1 text-xs font-semibold shadow">
                      {plan.badge}
                    </Badge>
                  </div>
                )}
                <CardHeader className="pb-4 pt-6">
                  <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl ${plan.highlight ? 'bg-primary' : 'bg-muted'}`}>
                    <Icon className={`h-5 w-5 ${plan.highlight ? 'text-primary-foreground' : 'text-foreground'}`} />
                  </div>
                  <CardTitle className="text-xl">{plan.name}</CardTitle>
                  <CardDescription className="text-pretty">{plan.description}</CardDescription>
                  <div className="mt-2">
                    <span className="text-3xl font-bold">{plan.price}</span>
                    <span className="ml-1 text-sm text-muted-foreground">/ {plan.period}</span>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col gap-4">
                  <ul className="flex-1 space-y-2.5">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2 text-sm">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <Button
                    className="mt-auto w-full"
                    variant={plan.highlight ? 'default' : isCurrent ? 'secondary' : 'outline'}
                    disabled={isCurrent || plan.id === 'free' || isLoading || loadingSub}
                    onClick={() => handleSubscribe(plan.id)}
                  >
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {isCurrent ? '✓ Current Plan' : plan.cta}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Footer note */}
        <p className="mt-8 text-center text-xs text-muted-foreground">
          Secure payments powered by Stripe. Cancel anytime. All prices in USD.
        </p>
      </div>
    </div>
  );
};

export default Pricing;
