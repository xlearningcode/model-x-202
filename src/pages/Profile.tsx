import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/db/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import {
  ArrowLeft, Loader2, Sparkles, Crown, Zap, User,
  KeyRound, CreditCard, LogOut, CheckCircle2,
} from 'lucide-react';

interface Subscription {
  plan: 'free' | 'monthly' | 'yearly';
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
}

interface Profile {
  username: string | null;
  email: string | null;
  created_at: string;
}

const planLabel: Record<string, string> = {
  free: 'Free',
  monthly: 'Pro Monthly',
  yearly: 'Pro Yearly',
};

const planIcon: Record<string, React.ElementType> = {
  free: Sparkles,
  monthly: Zap,
  yearly: Crown,
};

const Profile: React.FC = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [savingName, setSavingName] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    if (!user) { navigate('/'); return; }
    loadData();
  }, [user]);

  const loadData = async () => {
    setLoadingProfile(true);
    try {
      const [{ data: prof }, { data: sub }] = await Promise.all([
        supabase.from('profiles').select('username, email, created_at').eq('id', user!.id).single(),
        supabase.from('subscriptions').select('plan, status, current_period_end, cancel_at_period_end').eq('user_id', user!.id).maybeSingle(),
      ]);
      setProfile(prof);
      setDisplayName(prof?.username ?? '');
      setSubscription(sub);
    } catch {
      // ignore
    } finally {
      setLoadingProfile(false);
    }
  };

  const handleSaveName = async () => {
    if (!displayName.trim()) return;
    setSavingName(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ username: displayName.trim(), updated_at: new Date().toISOString() })
        .eq('id', user!.id);
      if (error) throw error;
      toast.success('Display name updated');
      setProfile((p) => p ? { ...p, username: displayName.trim() } : p);
    } catch (err: any) {
      toast.error(err.message || 'Failed to update name');
    } finally {
      setSavingName(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword.trim()) return;
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    setSavingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success('Password updated successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      toast.error(err.message || 'Failed to update password');
    } finally {
      setSavingPassword(false);
    }
  };

  const handleSignOut = async () => {
    setLoggingOut(true);
    try {
      await signOut();
      navigate('/');
    } catch {
      toast.error('Failed to sign out');
      setLoggingOut(false);
    }
  };

  const currentPlan = subscription?.plan ?? 'free';
  const PlanIcon = planIcon[currentPlan] ?? Sparkles;
  const isProActive = currentPlan !== 'free' && subscription?.status === 'active';

  if (loadingProfile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card/50 px-4 py-3">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/chat')} className="h-9 w-9">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary">
              <Sparkles className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-semibold">Profile & Settings</span>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
        {/* Account Info */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <User className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <CardTitle className="text-lg text-balance">
                  {profile?.username || user?.email?.split('@')[0] || 'User'}
                </CardTitle>
                <CardDescription className="truncate">{user?.email}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="display-name">Display Name</Label>
              <div className="flex gap-2">
                <Input
                  id="display-name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your display name"
                  className="flex-1"
                />
                <Button onClick={handleSaveName} disabled={savingName} size="default">
                  {savingName ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
                </Button>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-muted px-3 py-2 text-sm">
              <span className="text-muted-foreground">Member since</span>
              <span className="font-medium">
                {profile?.created_at ? new Date(profile.created_at).toLocaleDateString() : '—'}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Subscription */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-lg">Subscription</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-xl border border-border bg-muted/40 px-4 py-3">
              <div className="flex items-center gap-3">
                <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${isProActive ? 'bg-primary' : 'bg-muted'}`}>
                  <PlanIcon className={`h-5 w-5 ${isProActive ? 'text-primary-foreground' : 'text-foreground'}`} />
                </div>
                <div>
                  <p className="font-semibold">{planLabel[currentPlan]}</p>
                  <p className="text-xs text-muted-foreground capitalize">
                    {subscription?.status ?? 'active'}
                    {subscription?.current_period_end && isProActive && (
                      <> · renews {new Date(subscription.current_period_end).toLocaleDateString()}</>
                    )}
                  </p>
                </div>
              </div>
              {isProActive ? (
                <Badge variant="secondary" className="gap-1">
                  <CheckCircle2 className="h-3 w-3 text-green-500" />
                  Active
                </Badge>
              ) : (
                <Badge variant="outline">Free</Badge>
              )}
            </div>

            {!isProActive && (
              <Button className="w-full" onClick={() => navigate('/pricing')}>
                <Crown className="mr-2 h-4 w-4" />
                Upgrade to Pro
              </Button>
            )}
            {isProActive && (
              <Button variant="outline" className="w-full" onClick={() => navigate('/pricing')}>
                Manage Subscription
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Change Password */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-lg">Change Password</CardTitle>
            </div>
            <CardDescription>Update your account password.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleChangePassword} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="new-password">New Password</Label>
                <Input
                  id="new-password"
                  type="password"
                  placeholder="At least 8 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm-password">Confirm New Password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  placeholder="Repeat new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
              <Button type="submit" disabled={savingPassword || !newPassword || !confirmPassword} className="w-full">
                {savingPassword && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Update Password
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Sign Out */}
        <Card>
          <CardContent className="pt-6">
            <Separator className="mb-6" />
            <Button
              variant="outline"
              className="w-full border-destructive/50 text-destructive hover:bg-destructive hover:text-destructive-foreground"
              onClick={handleSignOut}
              disabled={loggingOut}
            >
              {loggingOut ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogOut className="mr-2 h-4 w-4" />}
              Sign Out
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Profile;
