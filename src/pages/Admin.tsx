import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Loader2, Users, CreditCard, ArrowLeft, Pencil, Crown, UserX, Save,
} from 'lucide-react';

interface UserRow {
  id: string;
  email: string;
  role: string;
  plan: string;
  status: string;
  created_at: string;
}

interface PricingPlan {
  id: string;
  name: string;
  plan_key: string;
  price: number;
  currency: string;
  period: string;
  description: string;
  features: string[];
  is_highlighted: boolean;
  badge: string | null;
  stripe_price_id: string | null;
  sort_order: number;
}

const PLAN_OPTIONS = ['free', 'monthly', 'yearly'] as const;
const STATUS_OPTIONS = ['active', 'cancelled', 'expired', 'trialing'] as const;

const Admin: React.FC = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();

  const [users, setUsers] = useState<UserRow[]>([]);
  const [plans, setPlans] = useState<PricingPlan[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingPlans, setLoadingPlans] = useState(true);

  // User edit dialog
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [editPlan, setEditPlan] = useState<string>('free');
  const [editStatus, setEditStatus] = useState<string>('active');
  const [savingUser, setSavingUser] = useState(false);

  // Plan edit dialog
  const [editPlanRow, setEditPlanRow] = useState<PricingPlan | null>(null);
  const [savingPlan, setSavingPlan] = useState(false);

  // Guard: admin only
  useEffect(() => {
    if (profile && profile.role !== 'admin') {
      toast.error('Access denied: Admins only');
      navigate('/chat');
    }
  }, [profile, navigate]);

  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, role, created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;

      const ids = (data ?? []).map((p) => p.id);
      let subMap: Record<string, { plan: string; status: string }> = {};
      if (ids.length > 0) {
        const { data: subs } = await supabase
          .from('subscriptions')
          .select('user_id, plan, status')
          .in('user_id', ids);
        for (const s of subs ?? []) subMap[s.user_id] = { plan: s.plan, status: s.status };
      }

      setUsers(
        (data ?? []).map((p) => ({
          id: p.id,
          email: p.email ?? '—',
          role: p.role,
          plan: subMap[p.id]?.plan ?? 'free',
          status: subMap[p.id]?.status ?? 'active',
          created_at: p.created_at,
        }))
      );
    } catch (err: any) {
      toast.error('Failed to load users: ' + err.message);
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  const loadPlans = useCallback(async () => {
    setLoadingPlans(true);
    try {
      const { data, error } = await supabase
        .from('pricing_plans')
        .select('*')
        .order('sort_order', { ascending: true });
      if (error) throw error;
      setPlans(
        (data ?? []).map((p) => ({ ...p, features: Array.isArray(p.features) ? p.features : JSON.parse(p.features ?? '[]') }))
      );
    } catch (err: any) {
      toast.error('Failed to load plans: ' + err.message);
    } finally {
      setLoadingPlans(false);
    }
  }, []);

  useEffect(() => {
    if (profile?.role === 'admin') {
      loadUsers();
      loadPlans();
    }
  }, [profile, loadUsers, loadPlans]);

  const openEditUser = (u: UserRow) => {
    setEditUser(u);
    setEditPlan(u.plan);
    setEditStatus(u.status);
  };

  const handleSaveUser = async () => {
    if (!editUser) return;
    setSavingUser(true);
    try {
      const { error } = await supabase.rpc('admin_set_user_plan', {
        p_user_id: editUser.id,
        p_plan: editPlan,
        p_status: editStatus,
      });
      if (error) throw error;
      toast.success(`Updated ${editUser.email} to ${editPlan} (${editStatus})`);
      setEditUser(null);
      await loadUsers();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update user');
    } finally {
      setSavingUser(false);
    }
  };

  const handleSavePlan = async () => {
    if (!editPlanRow) return;
    setSavingPlan(true);
    try {
      const { error } = await supabase
        .from('pricing_plans')
        .update({
          name: editPlanRow.name,
          price: editPlanRow.price,
          period: editPlanRow.period,
          description: editPlanRow.description,
          features: editPlanRow.features,
          is_highlighted: editPlanRow.is_highlighted,
          badge: editPlanRow.badge || null,
          stripe_price_id: editPlanRow.stripe_price_id || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editPlanRow.id);
      if (error) throw error;
      toast.success(`Plan "${editPlanRow.name}" updated`);
      setEditPlanRow(null);
      await loadPlans();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update plan');
    } finally {
      setSavingPlan(false);
    }
  };

  const planBadge = (plan: string) => {
    if (plan === 'yearly') return <Badge className="bg-primary text-primary-foreground">Yearly Pro</Badge>;
    if (plan === 'monthly') return <Badge variant="secondary">Monthly Pro</Badge>;
    return <Badge variant="outline">Free</Badge>;
  };

  if (profile && profile.role !== 'admin') return null;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card px-4 py-3 md:px-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/chat')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-lg font-semibold">Admin Panel</h1>
            <p className="text-xs text-muted-foreground">Model-x-202 Management</p>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl p-4 md:p-6">
        {/* Stats row */}
        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <Users className="h-8 w-8 shrink-0 text-primary" />
              <div>
                <p className="text-2xl font-bold">{users.length}</p>
                <p className="text-xs text-muted-foreground">Total Users</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <Crown className="h-8 w-8 shrink-0 text-primary" />
              <div>
                <p className="text-2xl font-bold">{users.filter((u) => u.plan !== 'free').length}</p>
                <p className="text-xs text-muted-foreground">Pro Users</p>
              </div>
            </CardContent>
          </Card>
          <Card className="col-span-2 md:col-span-1">
            <CardContent className="flex items-center gap-3 p-4">
              <CreditCard className="h-8 w-8 shrink-0 text-primary" />
              <div>
                <p className="text-2xl font-bold">{plans.length}</p>
                <p className="text-xs text-muted-foreground">Active Plans</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="users">
          <TabsList className="mb-4">
            <TabsTrigger value="users" className="gap-2">
              <Users className="h-4 w-4" />
              Users
            </TabsTrigger>
            <TabsTrigger value="pricing" className="gap-2">
              <CreditCard className="h-4 w-4" />
              Pricing Plans
            </TabsTrigger>
          </TabsList>

          {/* Users Tab */}
          <TabsContent value="users">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">User Management</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="whitespace-nowrap">Email</TableHead>
                        <TableHead className="whitespace-nowrap">Role</TableHead>
                        <TableHead className="whitespace-nowrap">Plan</TableHead>
                        <TableHead className="whitespace-nowrap">Status</TableHead>
                        <TableHead className="whitespace-nowrap">Joined</TableHead>
                        <TableHead className="whitespace-nowrap">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loadingUsers ? (
                        Array.from({ length: 4 }).map((_, i) => (
                          <TableRow key={i}>
                            {Array.from({ length: 6 }).map((_, j) => (
                              <TableCell key={j}><Skeleton className="h-5 w-24 bg-muted" /></TableCell>
                            ))}
                          </TableRow>
                        ))
                      ) : users.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                            No users found
                          </TableCell>
                        </TableRow>
                      ) : (
                        users.map((u) => (
                          <TableRow key={u.id}>
                            <TableCell className="whitespace-nowrap max-w-[180px] truncate font-medium">{u.email}</TableCell>
                            <TableCell className="whitespace-nowrap">
                              <Badge variant={u.role === 'admin' ? 'default' : 'outline'}>
                                {u.role}
                              </Badge>
                            </TableCell>
                            <TableCell className="whitespace-nowrap">{planBadge(u.plan)}</TableCell>
                            <TableCell className="whitespace-nowrap">
                              <Badge variant={u.status === 'active' ? 'secondary' : 'outline'}>
                                {u.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                              {new Date(u.created_at).toLocaleDateString()}
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="gap-1"
                                onClick={() => openEditUser(u)}
                              >
                                <Pencil className="h-3 w-3" />
                                Edit Plan
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Pricing Tab */}
          <TabsContent value="pricing">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Pricing Plans</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="whitespace-nowrap">Plan</TableHead>
                        <TableHead className="whitespace-nowrap">Key</TableHead>
                        <TableHead className="whitespace-nowrap">Price</TableHead>
                        <TableHead className="whitespace-nowrap">Period</TableHead>
                        <TableHead className="whitespace-nowrap">Highlighted</TableHead>
                        <TableHead className="whitespace-nowrap">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loadingPlans ? (
                        Array.from({ length: 3 }).map((_, i) => (
                          <TableRow key={i}>
                            {Array.from({ length: 6 }).map((_, j) => (
                              <TableCell key={j}><Skeleton className="h-5 w-20 bg-muted" /></TableCell>
                            ))}
                          </TableRow>
                        ))
                      ) : (
                        plans.map((p) => (
                          <TableRow key={p.id}>
                            <TableCell className="whitespace-nowrap font-medium">{p.name}</TableCell>
                            <TableCell className="whitespace-nowrap">
                              <Badge variant="outline">{p.plan_key}</Badge>
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                              ${p.price} {p.currency.toUpperCase()}
                            </TableCell>
                            <TableCell className="whitespace-nowrap capitalize">{p.period}</TableCell>
                            <TableCell className="whitespace-nowrap">
                              {p.is_highlighted ? (
                                <Badge className="bg-primary text-primary-foreground">Yes</Badge>
                              ) : (
                                <Badge variant="outline">No</Badge>
                              )}
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="gap-1"
                                onClick={() => setEditPlanRow({ ...p })}
                              >
                                <Pencil className="h-3 w-3" />
                                Edit
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Edit User Dialog */}
      <Dialog open={!!editUser} onOpenChange={(o) => !o && setEditUser(null)}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit User Plan</DialogTitle>
          </DialogHeader>
          {editUser && (
            <div className="space-y-4 py-2">
              <div className="rounded-lg bg-muted p-3 text-sm">
                <p className="font-medium">{editUser.email}</p>
                <p className="text-xs text-muted-foreground">ID: {editUser.id}</p>
              </div>
              <div className="space-y-2">
                <Label>Subscription Plan</Label>
                <Select value={editPlan} onValueChange={setEditPlan}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PLAN_OPTIONS.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p.charAt(0).toUpperCase() + p.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={editStatus} onValueChange={setEditStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUser(null)} disabled={savingUser}>
              Cancel
            </Button>
            <Button onClick={handleSaveUser} disabled={savingUser}>
              {savingUser ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Plan Dialog */}
      <Dialog open={!!editPlanRow} onOpenChange={(o) => !o && setEditPlanRow(null)}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Pricing Plan</DialogTitle>
          </DialogHeader>
          {editPlanRow && (
            <div className="space-y-3 py-2 max-h-[60vh] overflow-y-auto pr-1">
              <div className="space-y-1">
                <Label>Plan Name</Label>
                <Input
                  value={editPlanRow.name}
                  onChange={(e) => setEditPlanRow((prev) => prev ? { ...prev, name: e.target.value } : prev)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Price (USD)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editPlanRow.price}
                    onChange={(e) => setEditPlanRow((prev) => prev ? { ...prev, price: parseFloat(e.target.value) || 0 } : prev)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Period</Label>
                  <Input
                    value={editPlanRow.period}
                    placeholder="forever / month / year"
                    onChange={(e) => setEditPlanRow((prev) => prev ? { ...prev, period: e.target.value } : prev)}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Description</Label>
                <Input
                  value={editPlanRow.description}
                  onChange={(e) => setEditPlanRow((prev) => prev ? { ...prev, description: e.target.value } : prev)}
                />
              </div>
              <div className="space-y-1">
                <Label>Features (one per line)</Label>
                <Textarea
                  className="min-h-[100px] resize-y"
                  value={editPlanRow.features.join('\n')}
                  onChange={(e) =>
                    setEditPlanRow((prev) =>
                      prev ? { ...prev, features: e.target.value.split('\n').filter(Boolean) } : prev
                    )
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Badge (optional)</Label>
                  <Input
                    value={editPlanRow.badge ?? ''}
                    placeholder="e.g. Best Value"
                    onChange={(e) => setEditPlanRow((prev) => prev ? { ...prev, badge: e.target.value } : prev)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Stripe Price ID</Label>
                  <Input
                    value={editPlanRow.stripe_price_id ?? ''}
                    placeholder="price_xxx"
                    onChange={(e) => setEditPlanRow((prev) => prev ? { ...prev, stripe_price_id: e.target.value } : prev)}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="highlighted"
                  checked={editPlanRow.is_highlighted}
                  onChange={(e) => setEditPlanRow((prev) => prev ? { ...prev, is_highlighted: e.target.checked } : prev)}
                  className="h-4 w-4"
                />
                <Label htmlFor="highlighted" className="font-normal">Highlight this plan (show as recommended)</Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditPlanRow(null)} disabled={savingPlan}>
              Cancel
            </Button>
            <Button onClick={handleSavePlan} disabled={savingPlan}>
              {savingPlan ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save Plan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Admin;
