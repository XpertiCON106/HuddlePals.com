import { Link } from "react-router-dom";
import { usePageMeta } from "../usePageMeta";

export function NotFound() {
  usePageMeta(
    "Page not found — HuddlePals",
    "That page is not on the HuddlePals site.",
  );
  return (
    <div className="page">
      <h1 className="plain-title">This page isn’t here.</h1>
      <p>
        <Link to="/">Back home</Link>
      </p>
    </div>
  );
}
