import { deleteRetiredBillingKeys } from "@/lib/billing-keys";

deleteRetiredBillingKeys()
  .then(({ deleted, failed }) => {
    console.log(
      `[delete-retired-billing-keys] deleted ${deleted}, failed ${failed}`,
    );
    process.exit(0);
  })
  .catch((error) => {
    console.error("[delete-retired-billing-keys] fatal:", error);
    process.exit(1);
  });
