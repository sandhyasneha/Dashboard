import { PageHeader } from "@/components/ui";
import { Importer } from "@/components/Importer";

export default function ImportPage() {
  return (
    <>
      <PageHeader title="Import leads" sub="Excel or CSV. Column names from the FMCSA export are recognized automatically." />
      <Importer />
    </>
  );
}
