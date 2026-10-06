import type { Metadata } from "next";
import { LoginForm } from "./login-form";

// SEO Phase 7: a sign-in form has no search intent to satisfy and
// nothing worth showing in a search result — belt-and-suspenders with
// robots.ts NOT disallowing this path (see that file's own comment on
// why disallow and noindex solve different problems for a page that's
// legitimately reachable pre-account).
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function LoginPage() {
  return <LoginForm />;
}
