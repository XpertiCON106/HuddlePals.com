import privacyMd from "../content/privacy.md?raw";
import { LegalDocument } from "../components/LegalDocument";
import { usePageMeta } from "../usePageMeta";

export function Privacy() {
  usePageMeta(
    "Privacy Policy — HuddlePals",
    "How HuddlePals collects, encrypts, and stores photos and account data, and how to delete your account.",
  );
  return (
    <div className="page">
      <LegalDocument markdown={privacyMd} />
    </div>
  );
}
