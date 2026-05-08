import { Link } from "react-router-dom";
import { getToken } from "@/lib/auth";
import { AnnexLogo } from "@/components/AnnexLogo";
import "./LandingPage.css";

export function PrivacyPage() {
  const isLoggedIn = !!getToken();

  return (
    <div className="landing">
      <nav className="l-nav">
        <div className="l-nav-inner">
          <Link to="/"><AnnexLogo height={21} /></Link>
          <div className="l-nav-links">
            {!isLoggedIn && <Link className="l-nav-link" to="/login">login</Link>}
            {isLoggedIn
              ? <Link className="l-nav-cta" to="/dashboard">go to dashboard</Link>
              : <Link className="l-nav-cta" to="/register">get started</Link>}
          </div>
        </div>
      </nav>

      <section className="l-legal">
        <div className="site-wrap">
          <div className="l-legal-inner">
            <div className="l-legal-label">Legal</div>
            <h1 className="l-legal-title">Privacy Policy</h1>
            <p className="l-legal-meta">Effective date: May 8, 2026</p>

            <div className="l-legal-body">
              <h2>1. What We Collect</h2>
              <p>
                When you create an account, we collect your email address and a hashed password.
                If you add a display name or avatar, we store those too. We do not collect payment
                information directly; billing is handled by our payment processor.
              </p>
              <p>
                We log standard server-side request data (IP address, user-agent, timestamps) for
                security monitoring and abuse prevention. These logs are retained for up to 90 days.
              </p>
              <p>
                When you sign in, we also create a persistent session record so you can review and
                revoke active sign-ins from your account settings. Each record stores the IP address
                you signed in from, a coarse device type (phone, tablet, laptop, or desktop), a
                short client label derived from your browser's user-agent (for example, “Chrome on
                macOS”), and sign-in / last-used timestamps. We do not retain the full user-agent
                string. Session records are deleted when you sign out, when you revoke the session,
                or when the session expires (currently 7 days after last use).
              </p>

              <h2>2. Content You Create</h2>
              <p>
                Documents, files, and workspaces you create are stored on our servers and belong to
                you. We do not read, sell, or share your content with third parties except as
                required to operate the service (e.g., backups, CDN delivery).
              </p>
              <p>
                Published public sites are accessible to anyone with the link. Private workspaces
                are only accessible to you and members you explicitly invite.
              </p>

              <h2>3. How We Use Your Data</h2>
              <p>We use the information we collect to:</p>
              <ul>
                <li>Provide, maintain, and improve Annex</li>
                <li>Send transactional emails (account confirmation, password reset, invites)</li>
                <li>Detect and prevent abuse or unauthorized access</li>
                <li>Comply with legal obligations</li>
              </ul>
              <p>
                We do not use your content or personal data to train machine learning models, and
                we do not serve advertising.
              </p>

              <h2>4. Data Sharing</h2>
              <p>
                We do not sell your personal data. We share data only with service providers that
                help us operate Annex (cloud infrastructure, email delivery, error monitoring), and
                only to the extent necessary. Infrastructure is hosted on Cloudflare, whose handling
                of your data is governed by their own terms of service rather than a direct
                contractual obligation to us.
              </p>
              <p>
                We may disclose data if required by law or to protect the rights and safety of our
                users.
              </p>

              <h2>5. Cookies and Tracking</h2>
              <p>
                We use a session token stored in localStorage to keep you logged in. We do not use
                third-party tracking cookies or analytics pixels. Basic aggregate usage metrics
                (page loads, feature usage counts) may be collected without any personally
                identifying information.
              </p>

              <h2>6. Data Retention and Deletion</h2>
              <p>
                Your account and all associated data remain on our servers until you delete your
                account. You can request account deletion at any time from your account settings.
                We will delete your data within 30 days of the request, except where retention is
                required by law.
              </p>

              <h2>7. Security</h2>
              <p>
                All data is transmitted over HTTPS. Passwords are stored as salted cryptographic hashes and are never stored in plain text. We take
                reasonable technical and organizational measures to protect your data, but no
                system is perfectly secure. Use a strong, unique password and enable two-factor
                authentication where available.
              </p>

              <h2>8. Children</h2>
              <p>
                Annex is not directed at children under 13. We do not knowingly collect personal
                information from children. If you believe a child has provided us personal data,
                contact us and we will delete it.
              </p>

              <h2>9. Changes to This Policy</h2>
              <p>
                We may update this policy from time to time. If we make material changes we will
                notify registered users by email or via an in-app notice. The effective date at the
                top of this page reflects the most recent revision.
              </p>

              <h2>10. Contact</h2>
              <p>
                Questions about this policy? Email us at{" "}
                <a href="mailto:cubity@cubityfir.st?subject=Annex%20Privacy">cubity@cubityfir.st</a>.
              </p>
            </div>
          </div>
        </div>
      </section>

      <footer className="l-footer">
        <div className="l-footer-inner">
          <AnnexLogo height={18} fill="#383430" />
          <div className="l-footer-links">
            <Link className="l-footer-link" to="/">Home</Link>
            <Link className="l-footer-link" to="/privacy">Privacy</Link>
            <Link className="l-footer-link" to="/terms">Terms</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
