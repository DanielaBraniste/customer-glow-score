import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const PrivacyPolicy = () => (
  <div className="min-h-screen bg-background">
    <Navbar />
    <main className="max-w-3xl mx-auto px-6 py-20 prose prose-neutral dark:prose-invert">
      <h1>Privacy Policy</h1>
      <p className="text-muted-foreground">Last updated: April 1, 2026</p>

      <h2>1. Information We Collect</h2>
      <p>We collect information you provide directly, such as your name, email address, and company details when you create an account. We also collect usage data automatically, including log data, device information, and cookies.</p>

      <h2>2. How We Use Your Information</h2>
      <p>We use your information to provide and improve our services, communicate with you, ensure security, and comply with legal obligations. We do not sell your personal data to third parties.</p>

      <h2>3. Data Storage & Security</h2>
      <p>Your data is stored securely using industry-standard encryption. We implement appropriate technical and organizational measures to protect your personal information against unauthorized access, alteration, or destruction.</p>

      <h2>4. Third-Party Services</h2>
      <p>We may use third-party services (such as analytics and payment processors) that collect, monitor, and analyze data. These services have their own privacy policies governing use of your information.</p>

      <h2>5. Cookies</h2>
      <p>We use cookies and similar tracking technologies to enhance your experience. You can instruct your browser to refuse all cookies or to indicate when a cookie is being sent.</p>

      <h2>6. Data Retention</h2>
      <p>We retain your personal data only for as long as necessary to fulfill the purposes for which it was collected, including to satisfy legal, accounting, or reporting requirements.</p>

      <h2>7. Your Rights</h2>
      <p>You have the right to access, correct, or delete your personal data. You may also request data portability or restrict processing. To exercise these rights, contact us at the email below.</p>

      <h2>8. Children's Privacy</h2>
      <p>Our service is not intended for individuals under 16. We do not knowingly collect personal data from children.</p>

      <h2>9. Changes to This Policy</h2>
      <p>We may update this policy from time to time. We will notify you of any changes by posting the new policy on this page and updating the "Last updated" date.</p>

      <h2>10. Contact Us</h2>
      <p>If you have questions about this Privacy Policy, please contact us at <a href="mailto:privacy@rescuro.com" className="text-primary">privacy@rescuro.com</a>.</p>
    </main>
    <Footer />
  </div>
);

export default PrivacyPolicy;
