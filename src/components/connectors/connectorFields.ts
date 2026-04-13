// Available importable fields per connector
// key = the snapshot data key used in the edge function
// label = user-facing name

export interface ConnectorField {
  key: string;
  label: string;
  description: string;
  default: boolean; // checked by default
}

export const connectorFields: Record<string, ConnectorField[]> = {
  hubspot: [
    { key: "mrr", label: "MRR", description: "Monthly recurring revenue (annualrevenue / 12)", default: true },
    { key: "nps", label: "NPS", description: "Net Promoter Score from feedback", default: true },
    { key: "lastLogin", label: "Last Activity", description: "Most recent sales activity or modification date", default: true },
    { key: "supportTickets", label: "Support Tickets", description: "Number of associated tickets", default: true },
    { key: "contractEnd", label: "Contract End", description: "Close date of the deal", default: true },
    { key: "usageScore", label: "Usage Score", description: "Derived from page visits", default: true },
    { key: "deals", label: "Total Deals", description: "Number of associated deals", default: false },
    { key: "openDeals", label: "Open Deals", description: "Number of currently open deals", default: false },
    { key: "leadStatus", label: "Lead Status", description: "HubSpot lead status", default: false },
    { key: "lifecycleStage", label: "Lifecycle Stage", description: "HubSpot lifecycle stage", default: false },
    { key: "pageViews", label: "Page Views", description: "Total analytics page views", default: false },
  ],
  intercom: [
    { key: "mrr", label: "MRR", description: "Monthly spend from Intercom", default: true },
    { key: "nps", label: "NPS", description: "NPS score from custom attributes", default: true },
    { key: "lastLogin", label: "Last Activity", description: "Last request timestamp", default: true },
    { key: "supportTickets", label: "Support Tickets", description: "Open conversation count", default: true },
    { key: "contractEnd", label: "Contract End", description: "From custom attributes (renewal date)", default: true },
    { key: "usageScore", label: "Usage Score", description: "Derived from session count", default: true },
    { key: "activeUsers", label: "Active Users", description: "User count on the company", default: false },
    { key: "plan", label: "Plan", description: "Intercom plan name", default: false },
  ],
  salesforce: [
    { key: "mrr", label: "MRR", description: "Annual revenue divided by 12", default: true },
    { key: "nps", label: "NPS", description: "Derived from Account Rating", default: true },
    { key: "lastLogin", label: "Last Activity", description: "Last activity date on the account", default: true },
    { key: "supportTickets", label: "Support Tickets", description: "Open case count", default: true },
    { key: "contractEnd", label: "Contract End", description: "Latest won opportunity close date", default: true },
    { key: "usageScore", label: "Usage Score", description: "Derived from Account Rating", default: true },
    { key: "employees", label: "Employees", description: "Number of employees", default: false },
    { key: "rating", label: "Rating", description: "Account rating (Hot/Warm/Cold)", default: false },
  ],
  zendesk: [
    { key: "supportTickets", label: "Support Tickets", description: "Ticket count per organization", default: true },
    { key: "lastLogin", label: "Last Activity", description: "Organization last updated date", default: true },
    { key: "contractEnd", label: "Contract End", description: "From organization custom fields", default: true },
    { key: "tags", label: "Tags", description: "Organization tags", default: false },
  ],
  pipedrive: [
    { key: "mrr", label: "MRR", description: "Total won deal value / 12", default: true },
    { key: "lastLogin", label: "Last Activity", description: "Last activity date", default: true },
    { key: "contractEnd", label: "Contract End", description: "Next activity date", default: true },
    { key: "usageScore", label: "Usage Score", description: "Ratio of done to total activities", default: true },
    { key: "openDeals", label: "Open Deals", description: "Number of open deals", default: false },
    { key: "wonDeals", label: "Won Deals", description: "Number of won deals", default: false },
    { key: "lostDeals", label: "Lost Deals", description: "Number of lost deals", default: false },
    { key: "contacts", label: "Contacts", description: "Number of associated people", default: false },
  ],
  stripe: [
    { key: "mrr", label: "MRR", description: "Monthly recurring revenue from active subscriptions", default: true },
    { key: "contractEnd", label: "Contract End", description: "Current subscription period end", default: true },
    { key: "activeSubscriptions", label: "Active Subscriptions", description: "Count of active/trialing subscriptions", default: true },
    { key: "canceledSubscriptions", label: "Canceled Subscriptions", description: "Count of canceled subscriptions", default: false },
    { key: "paymentFailures", label: "Payment Failures", description: "Failed invoice count", default: true },
    { key: "plan", label: "Plan", description: "Subscription plan name", default: false },
  ],
  segment: [
    { key: "mrr", label: "MRR", description: "From profile traits (mrr/revenue)", default: true },
    { key: "nps", label: "NPS", description: "From profile traits", default: true },
    { key: "lastLogin", label: "Last Activity", description: "From profile traits (last_seen/last_active)", default: true },
    { key: "supportTickets", label: "Support Tickets", description: "From profile traits", default: true },
    { key: "contractEnd", label: "Contract End", description: "From profile traits (contract_end/renewal_date)", default: true },
    { key: "usageScore", label: "Usage Score", description: "From profile traits (usage_score/engagement)", default: true },
  ],
  slack: [
    { key: "slackMessages7d", label: "Messages (7d)", description: "Message count in last 7 days", default: true },
    { key: "slackActiveUsers7d", label: "Active Users (7d)", description: "Unique posters in last 7 days", default: true },
    { key: "slackChannelMembers", label: "Channel Members", description: "Total channel member count", default: true },
    { key: "slackChannel", label: "Channel Name", description: "Matched Slack channel", default: true },
    { key: "lastLogin", label: "Last Activity", description: "Most recent message timestamp", default: true },
    { key: "usageScore", label: "Usage Score", description: "Derived from message activity", default: true },
  ],
};
