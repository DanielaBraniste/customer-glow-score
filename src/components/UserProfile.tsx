import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { User, Save, Loader2, Bell } from "lucide-react";
import { toast } from "sonner";

type NotificationFrequency = "daily" | "weekly" | "biweekly" | "monthly" | "quarterly";
type PlanTier = "free" | "starter" | "medium" | "premium";

interface Profile {
  username: string;
  company: string;
  plan: PlanTier;
  notification_frequency: NotificationFrequency;
  email_notifications: boolean;
  slack_notifications: boolean;
  alert_threshold: number;
  slack_webhook_url: string;
}

const frequencyByPlan: Record<PlanTier, NotificationFrequency[]> = {
  free: ["weekly", "biweekly", "monthly"],
  starter: ["weekly", "biweekly", "monthly"],
  medium: ["daily", "weekly", "biweekly", "monthly", "quarterly"],
  premium: ["daily", "weekly", "biweekly", "monthly", "quarterly"],
};

const frequencyLabels: Record<NotificationFrequency, string> = {
  daily: "Daily",
  weekly: "Weekly",
  biweekly: "Every 2 Weeks",
  monthly: "Monthly",
  quarterly: "Quarterly",
};

const UserProfile = () => {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile>({
    username: "",
    company: "",
    plan: "free",
    notification_frequency: "weekly",
    email_notifications: true,
    slack_notifications: false,
    alert_threshold: 60,
    slack_webhook_url: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    const fetchProfile = async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("username, company, plan, notification_frequency, email_notifications, slack_notifications, alert_threshold, slack_webhook_url")
        .eq("user_id", user.id)
        .maybeSingle();

      if (data) {
        setProfile({
          username: data.username || "",
          company: data.company || "",
          plan: (data.plan as PlanTier) || "free",
          notification_frequency: (data.notification_frequency as NotificationFrequency) || "weekly",
          email_notifications: data.email_notifications ?? true,
          slack_notifications: data.slack_notifications ?? false,
          alert_threshold: (data as any).alert_threshold ?? 60,
          slack_webhook_url: (data as any).slack_webhook_url || "",
        });
      } else if (!error) {
        await supabase.from("profiles").insert({ user_id: user.id });
      }
      setLoading(false);
    };
    fetchProfile();
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        username: profile.username,
        company: profile.company,
        notification_frequency: profile.notification_frequency,
        email_notifications: profile.email_notifications,
        slack_notifications: profile.slack_notifications,
        alert_threshold: profile.alert_threshold,
        slack_webhook_url: profile.slack_webhook_url,
      } as any)
      .eq("user_id", user.id);

    if (error) {
      toast.error("Failed to save profile");
    } else {
      toast.success("Profile updated");
      setOpen(false);
    }
    setSaving(false);
  };

  const handleSendTest = async () => {
    if (!user) return;
    setSendingTest(true);
    try {
      const { error } = await supabase.functions.invoke("send-notifications", {
        body: { test: true, user_id: user.id },
      });
      if (error) {
        toast.error("Failed to send test notification");
      } else {
        toast.success("Test notification sent! Check your email and/or Slack.");
      }
    } catch {
      toast.error("Failed to send test notification");
    } finally {
      setSendingTest(false);
    }
  };

  const availableFrequencies = frequencyByPlan[profile.plan];

  useEffect(() => {
    if (!availableFrequencies.includes(profile.notification_frequency)) {
      setProfile((p) => ({ ...p, notification_frequency: availableFrequencies[0] }));
    }
  }, [profile.plan, availableFrequencies, profile.notification_frequency]);

  const displayName = profile.username || user?.email?.split("@")[0] || "User";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2 hover:bg-secondary/60 transition-colors">
          <div className="h-8 w-8 rounded-full bg-primary/15 flex items-center justify-center">
            <User className="h-4 w-4 text-primary" />
          </div>
          <div className="text-left hidden sm:block">
            <p className="text-sm font-medium leading-none">{displayName}</p>
            {profile.company && (
              <p className="text-xs text-muted-foreground mt-0.5">{profile.company}</p>
            )}
          </div>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 bg-card border-border" align="start" sideOffset={8}>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <h4 className="font-semibold text-sm mb-1">Profile Settings</h4>
              <p className="text-xs text-muted-foreground">
                {profile.plan.charAt(0).toUpperCase() + profile.plan.slice(1)} Plan
              </p>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="profile-username" className="text-xs">Username</Label>
                <Input
                  id="profile-username"
                  placeholder="Your name"
                  value={profile.username}
                  onChange={(e) => setProfile({ ...profile, username: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="profile-company" className="text-xs">Company</Label>
                <Input
                  id="profile-company"
                  placeholder="Your company"
                  value={profile.company}
                  onChange={(e) => setProfile({ ...profile, company: e.target.value })}
                />
              </div>
            </div>

            <div className="border-t border-border pt-4 space-y-3">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">Notifications</Label>

              <div className="flex items-center justify-between">
                <Label htmlFor="email-notif" className="text-sm">Email Notifications</Label>
                <Switch
                  id="email-notif"
                  checked={profile.email_notifications}
                  onCheckedChange={(val) => setProfile({ ...profile, email_notifications: val })}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="notif-freq" className="text-xs">Frequency</Label>
                <Select
                  value={profile.notification_frequency}
                  onValueChange={(val) => setProfile({ ...profile, notification_frequency: val as NotificationFrequency })}
                >
                  <SelectTrigger id="notif-freq">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableFrequencies.map((freq) => (
                      <SelectItem key={freq} value={freq}>
                        {frequencyLabels[freq]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="slack-notif" className="text-sm">Slack Notifications</Label>
                  <p className="text-xs text-muted-foreground">Get alerts in Slack</p>
                </div>
                <Switch
                  id="slack-notif"
                  checked={profile.slack_notifications}
                  onCheckedChange={(val) => setProfile({ ...profile, slack_notifications: val })}
                />
              </div>

              {profile.slack_notifications && (
                <div className="space-y-1.5">
                  <Label htmlFor="slack-webhook" className="text-xs">Slack Webhook URL</Label>
                  <Input
                    id="slack-webhook"
                    placeholder="https://hooks.slack.com/services/..."
                    value={profile.slack_webhook_url}
                    onChange={(e) => setProfile({ ...profile, slack_webhook_url: e.target.value })}
                    className="text-xs"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Create an incoming webhook in your Slack workspace.
                  </p>
                </div>
              )}

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Alert Threshold</Label>
                  <span className="text-xs font-medium text-foreground">{profile.alert_threshold}</span>
                </div>
                <Slider
                  value={[profile.alert_threshold]}
                  onValueChange={(v) => setProfile({ ...profile, alert_threshold: v[0] })}
                  min={0}
                  max={100}
                  step={5}
                />
                <p className="text-[10px] text-muted-foreground">
                  Get alerted when any company's health score falls below {profile.alert_threshold}.
                </p>
              </div>
            </div>

            <Button variant="hero" size="sm" className="w-full" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              Save Changes
            </Button>

            <Button
              variant="heroOutline"
              size="sm"
              className="w-full"
              onClick={handleSendTest}
              disabled={sendingTest || (!profile.email_notifications && !profile.slack_notifications)}
            >
              {sendingTest ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Sending…</>
              ) : (
                <><Bell className="h-4 w-4 mr-2" /> Send Test Notification</>
              )}
            </Button>
            {!profile.email_notifications && !profile.slack_notifications && (
              <p className="text-[10px] text-muted-foreground text-center">
                Enable email or Slack notifications to send a test.
              </p>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};

export default UserProfile;
