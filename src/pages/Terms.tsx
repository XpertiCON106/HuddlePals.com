import termsMd from "../content/terms.md?raw";
import { LegalDocument } from "../components/LegalDocument";
import { usePageMeta } from "../usePageMeta";

export function Terms() {
  usePageMeta(
    "Terms of Service — HuddlePals",
    "Terms of Service for the HuddlePals app and the website at huddlepals.com.",
  );
  return (
    <div className="page">
      <LegalDocument markdown={termsMd} />
    </div>
  );
}
