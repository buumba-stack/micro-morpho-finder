import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/LegalPage";

const DESC =
  "Terms of Use for the hosted MicroFluor web service and accounts. MicroFluor source code is released under the MIT License.";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Use · MicroFluor" },
      { name: "description", content: DESC },
      { property: "og:title", content: "Terms of Use · MicroFluor" },
      { property: "og:description", content: DESC },
      { name: "twitter:title", content: "Terms of Use · MicroFluor" },
      { name: "twitter:description", content: DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <LegalPage title="Terms of Use">
      <p>
        These Terms of Use govern access to and use of the hosted MicroFluor web service at this
        website, including any MicroFluor account (together, the <strong>Service</strong>).
      </p>

      <h2>1. Source code license</h2>
      <p>
        MicroFluor's source code is released under the MIT License. Your rights to use, copy,
        modify, and distribute the software are set out in that license, not in these Terms. These
        Terms apply only to the hosted Service and accounts.
      </p>

      <h2>2. Accounts and access</h2>
      <ul>
        <li>Keep your sign-in credentials and any access key confidential.</li>
        <li>You are responsible for activity carried out through your account or access key.</li>
        <li>Access to the Service, including AI features and usage limits, may be changed, suspended, or revoked.</li>
      </ul>

      <h2>3. Acceptable use of the Service</h2>
      <ul>
        <li>Do not attempt to bypass authentication, access controls, or usage limits.</li>
        <li>Do not interfere with, overload, or disrupt the Service or its infrastructure.</li>
        <li>Do not use the Service for unlawful purposes.</li>
      </ul>

      <h2>4. Third-party components</h2>
      <p>
        MicroFluor incorporates and is distributed with third-party and open-source software. Those
        components are not owned by Buumba Hampuwo and remain governed by their respective copyright
        notices and license terms. Nothing in these Terms limits, overrides, or reduces any right
        granted to you under an applicable third-party open-source license. See the{" "}
        <a href="/third-party-licenses" className="underline hover:text-foreground">
          Third-Party Licenses
        </a>{" "}
        page.
      </p>

      <h2>5. Scientific use and no warranty</h2>
      <p>
        MicroFluor supports image-based particle measurement and classification. Results should be
        reviewed by a qualified operator. To the maximum extent permitted by applicable law, the
        Software is provided "as is" and without warranties of any kind, express or implied,
        including merchantability, fitness for a particular purpose, and non-infringement.
      </p>

      <h2>6. Changes</h2>
      <p>These Terms may be updated. Continued use of the Software constitutes acceptance.</p>

      <p className="pt-4">MicroFluor © 2026 Buumba Hampuwo. Released under the MIT License.</p>
    </LegalPage>
  );
}
