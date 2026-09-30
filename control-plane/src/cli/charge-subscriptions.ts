import { chargeDueSubscriptions } from "@/lib/subscription-renewals";

chargeDueSubscriptions()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("[charge-subscriptions] fatal:", error);
    process.exit(1);
  });
