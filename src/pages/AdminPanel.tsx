import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Lock, Users, Eye, Trash2, Shield, ArrowLeft, Zap, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";

interface UserData {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  profile: {
    username: string | null;
    company: string | null;
    plan: string;
    email_notifications: boolean;
    slack_notifications: boolean;
    notification_frequency: string;
  } | null;
  connectors: Array<{
    id: string;
    connector_id: string;
    is_active: boolean;
    last_import_at: string | null;
    api_key: string | null;
  }>;
  import_logs: Array<{
    id: string;
    connector_id: string;
    status: string;
    records_imported: number | null;
    started_at: string;
    completed_at: string | null;
    error_message: string | null;
  }>;
}

const callAdmin = async (password: string, action: string, params?: Record<string, string>, body?: object) => {
  const queryParams = new URLSearchParams({ action, ...params });
  const options: RequestInit = {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      "x-admin-password": password,
    },
  };
  if (body) options.body = JSON.stringify(body);

  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const res = await fetch(
    `https://${projectId}.supabase.co/functions/v1/admin-users?${queryParams}`,
    options
  );
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Request failed");
  }
  return res.json();
};

const AdminPanel = () => {
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [users, setUsers] = useState<UserData[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<UserData | null>(null);

  const handleLogin = async () => {
    setLoading(true);
    try {
      const data = await callAdmin(password, "list");
      setUsers(data.users);
      setAuthenticated(true);
    } catch {
      toast.error("Invalid admin password");
    } finally {
      setLoading(false);
    }
  };

  const refreshUsers = async () => {
    setLoading(true);
    try {
      const data = await callAdmin(password, "list");
      setUsers(data.users);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleViewUser = async (user: UserData) => {
    try {
      const data = await callAdmin(password, "get-user", { userId: user.id });
      setSelectedUser(data.user);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleUpdatePlan = async (userId: string, plan: string) => {
    try {
      await callAdmin(password, "update-profile", {}, { userId, updates: { plan } });
      toast.success("Plan updated");
      if (selectedUser) {
        setSelectedUser({
          ...selectedUser,
          profile: selectedUser.profile ? { ...selectedUser.profile, plan } : null,
        });
      }
      refreshUsers();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleToggleConnector = async (connectorId: string, isActive: boolean) => {
    try {
      await callAdmin(password, "update-connector", {}, { connectorId, updates: { is_active: !isActive } });
      toast.success("Connector updated");
      if (selectedUser) {
        handleViewUser(selectedUser);
      }
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;
    try {
      await callAdmin(password, "delete-user", {}, { userId: userToDelete.id });
      toast.success("User deleted");
      setDeleteDialogOpen(false);
      setUserToDelete(null);
      if (selectedUser?.id === userToDelete.id) setSelectedUser(null);
      refreshUsers();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <Shield className="h-6 w-6 text-primary" />
            </div>
            <CardTitle>Admin Access</CardTitle>
            <CardDescription>Enter the admin password to continue</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              type="password"
              placeholder="Admin password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLogin()}
            />
            <Button className="w-full" onClick={handleLogin} disabled={loading || !password}>
              <Lock className="h-4 w-4 mr-2" /> {loading ? "Verifying..." : "Access Panel"}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (selectedUser) {
    return (
      <div className="min-h-screen bg-background px-6 py-8">
        <div className="max-w-5xl mx-auto">
          <Button variant="ghost" className="mb-6" onClick={() => setSelectedUser(null)}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Back to Users
          </Button>

          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold">{selectedUser.email}</h1>
              <p className="text-muted-foreground text-sm">
                Joined {format(new Date(selectedUser.created_at), "PPP")}
                {selectedUser.last_sign_in_at &&
                  ` · Last active ${format(new Date(selectedUser.last_sign_in_at), "PPp")}`}
              </p>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => { setUserToDelete(selectedUser); setDeleteDialogOpen(true); }}
            >
              <Trash2 className="h-4 w-4 mr-2" /> Delete User
            </Button>
          </div>

          <Tabs defaultValue="profile">
            <TabsList>
              <TabsTrigger value="profile">Profile</TabsTrigger>
              <TabsTrigger value="connectors">Connectors ({selectedUser.connectors.length})</TabsTrigger>
              <TabsTrigger value="imports">Import Logs ({selectedUser.import_logs.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="profile">
              <Card>
                <CardContent className="pt-6 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Username</p>
                      <p className="font-medium">{selectedUser.profile?.username || "—"}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Company</p>
                      <p className="font-medium">{selectedUser.profile?.company || "—"}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Plan</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className="capitalize">{selectedUser.profile?.plan || "free"}</Badge>
                        <div className="flex gap-1">
                          {["free", "starter", "medium", "premium"].map((p) => (
                            <Button
                              key={p}
                              variant={selectedUser.profile?.plan === p ? "default" : "outline"}
                              size="sm"
                              className="capitalize text-xs h-7"
                              onClick={() => handleUpdatePlan(selectedUser.id, p)}
                            >
                              {p}
                            </Button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Notifications</p>
                      <p className="font-medium text-sm">
                        {selectedUser.profile?.email_notifications ? "Email ✓" : "Email ✗"}
                        {" · "}
                        {selectedUser.profile?.slack_notifications ? "Slack ✓" : "Slack ✗"}
                        {" · "}
                        {selectedUser.profile?.notification_frequency || "weekly"}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="connectors">
              <Card>
                <CardContent className="pt-6">
                  {selectedUser.connectors.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">No connectors configured</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Connector</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Last Import</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedUser.connectors.map((c) => (
                          <TableRow key={c.id}>
                            <TableCell className="font-medium capitalize">{c.connector_id}</TableCell>
                            <TableCell>
                              <Badge variant={c.is_active ? "default" : "secondary"}>
                                {c.is_active ? "Active" : "Inactive"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {c.last_import_at ? format(new Date(c.last_import_at), "PPp") : "Never"}
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleToggleConnector(c.id, c.is_active)}
                              >
                                {c.is_active ? "Deactivate" : "Activate"}
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="imports">
              <Card>
                <CardContent className="pt-6">
                  {selectedUser.import_logs.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">No import logs</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Connector</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Records</TableHead>
                          <TableHead>Started</TableHead>
                          <TableHead>Error</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedUser.import_logs.map((log) => (
                          <TableRow key={log.id}>
                            <TableCell className="font-medium capitalize">{log.connector_id}</TableCell>
                            <TableCell>
                              <Badge variant={log.status === "completed" ? "default" : log.status === "failed" ? "destructive" : "secondary"}>
                                {log.status}
                              </Badge>
                            </TableCell>
                            <TableCell>{log.records_imported ?? "—"}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {format(new Date(log.started_at), "PPp")}
                            </TableCell>
                            <TableCell className="text-sm text-destructive max-w-[200px] truncate">
                              {log.error_message || "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete User</DialogTitle>
              <DialogDescription>
                This will permanently delete {userToDelete?.email} and all their data. This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
              <Button variant="destructive" onClick={handleDeleteUser}>Delete</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-6 py-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Shield className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Admin Panel</h1>
              <p className="text-muted-foreground text-sm">{users.length} registered users</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={refreshUsers} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </Button>
        </div>

        <Card>
          <CardContent className="pt-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Username</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Connectors</TableHead>
                  <TableHead>Imports</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead>Last Active</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.email}</TableCell>
                    <TableCell className="text-muted-foreground">{user.profile?.username || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{user.profile?.company || "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">{user.profile?.plan || "free"}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Zap className="h-3 w-3 text-muted-foreground" />
                        {user.connectors.length}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <FileText className="h-3 w-3 text-muted-foreground" />
                        {user.import_logs.length}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(user.created_at), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {user.last_sign_in_at
                        ? format(new Date(user.last_sign_in_at), "MMM d, yyyy")
                        : "Never"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => handleViewUser(user)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => { setUserToDelete(user); setDeleteDialogOpen(true); }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete User</DialogTitle>
            <DialogDescription>
              This will permanently delete {userToDelete?.email} and all their data. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteUser}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminPanel;
