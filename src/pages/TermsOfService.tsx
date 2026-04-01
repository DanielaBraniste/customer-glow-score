import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const TermsOfService = () => (
  <div className="min-h-screen bg-background">
    <Navbar />
    <main className="max-w-3xl mx-auto px-6 py-20 prose prose-neutral dark:prose-invert">
      <h1>Terms of Service</h1>
      <p className="text-muted-foreground">Last updated: April 1, 2026</p>

      <h2>1. Acceptance of Terms</h2>
      <p>By accessing or using Rescuro ("the Service"), you agree to be bound by these Terms of Service. If you do not agree, you may not use the Service.</p>

      <h2>2. Description of Service</h2>
      <p>Rescuro provides a customer health scoring platform that aggregates data from various connectors to help SaaS teams monitor and improve customer relationships.</p>

      <h2>3. Account Registration</h2>
      <p>You must provide accurate and complete information when creating an account. You are responsible for maintaining the confidentiality of your credentials and for all activities under your account.</p>

      <h2>4. Acceptable Use</h2>
      <p>You agree not to misuse the Service, including but not limited to: reverse engineering, unauthorized access attempts, distributing malware, or using the Service for any unlawful purpose.</p>

      <h2>5. Intellectual Property</h2>
      <p>All content, features, and functionality of the Service are owned by Rescuro and are protected by copyright, trademark, and other intellectual property laws.</p>

      <h2>6. Data Ownership</h2>
      <p>You retain ownership of all data you upload or import into the Service. By using the Service, you grant us a limited license to process your data solely to provide the Service.</p>

      <h2>7. Payment & Billing</h2>
      <p>Paid plans are billed in advance on a monthly basis. Refunds are not provided for partial months of service. We reserve the right to modify pricing with 30 days' notice.</p>

      <h2>8. Service Availability</h2>
      <p>We strive to maintain high availability but do not guarantee uninterrupted access. We are not liable for any downtime or service interruptions.</p>

      <h2>9. Limitation of Liability</h2>
      <p>To the maximum extent permitted by law, Rescuro shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the Service.</p>

      <h2>10. Termination</h2>
      <p>We may suspend or terminate your access at any time for violations of these Terms. Upon termination, your right to use the Service ceases immediately. You may export your data within 30 days of termination.</p>

      <h2>11. Governing Law</h2>
      <p>These Terms are governed by the laws of the jurisdiction in which Rescuro operates, without regard to conflict of law provisions.</p>

      <h2>12. Changes to Terms</h2>
      <p>We reserve the right to modify these Terms at any time. Continued use of the Service after changes constitutes acceptance of the new Terms.</p>

      <h2>13. Contact</h2>
      <p>For questions about these Terms, contact us at <a href="mailto:legal@rescuro.com" className="text-primary">legal@rescuro.com</a>.</p>
    </main>
    <Footer />
  </div>
);

export default TermsOfService;
