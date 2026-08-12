import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/LegalPage";

const DESC =
  "Terms of Use for MicroFluor, proprietary microplastic morphology analysis software owned by Buumba Hampuwo.";

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
        These Terms of Use govern access to and use of MicroFluor, including this website and the
        MicroFluor desktop application (together, the <strong>Software</strong>).
      </p>

      <h2>1. Ownership</h2>
      <p>
        MicroFluor's original software, source code, user interface, workflows, documentation,
        designs, business logic, algorithms, configurations, and other original content are
        proprietary to Buumba Hampuwo. All rights not expressly granted are reserved.
      </p>

      <h2>2. Permitted use</h2>
      <p>
        Authorized users are granted only the limited right necessary to operate the Software for its
        intended purpose. Access to this website does not grant ownership of MicroFluor, nor a
        general license to copy, reproduce, redistribute, resell, sublicense, publish, or create
        derivative products from the proprietary portions of MicroFluor.
      </p>

      <h2>3. Restrictions</h2>
      <ul>
        <li>No reproduction or distribution of proprietary components without written authorization.</li>
        <li>No commercial exploitation, resale, or sublicensing of proprietary components.</li>
        <li>No creation of derivative works from proprietary components.</li>
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

      <p className="pt-4">MicroFluor © 2026 Buumba Hampuwo. All Rights Reserved.</p>
    </LegalPage>
  );
}
