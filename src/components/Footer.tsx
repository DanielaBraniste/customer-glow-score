const Footer = () => (
  <footer className="border-t border-border py-12 px-6">
    <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
      <div className="flex items-center gap-2">
        <div className="h-6 w-6 rounded bg-primary flex items-center justify-center">
          <span className="text-primary-foreground font-bold text-xs">D</span>
        </div>
        <span className="font-semibold">Desi</span>
      </div>
      <div className="flex gap-6 text-sm text-muted-foreground">
        <a href="#" className="hover:text-foreground transition-colors">Privacy</a>
        <a href="#" className="hover:text-foreground transition-colors">Terms</a>
        <a href="#" className="hover:text-foreground transition-colors">Contact</a>
      </div>
      <p className="text-sm text-muted-foreground">© 2026 Desi. All rights reserved.</p>
    </div>
  </footer>
);

export default Footer;
