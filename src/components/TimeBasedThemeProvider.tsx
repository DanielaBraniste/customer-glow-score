import { ThemeProvider, useTheme } from "next-themes";
import { useEffect } from "react";

const TimeSync = () => {
  const { setTheme, theme } = useTheme();

  useEffect(() => {
    const applyTimeTheme = () => {
      const hour = new Date().getHours();
      const isDaytime = hour >= 7 && hour < 19;
      const target = isDaytime ? "light" : "dark";
      // Only auto-set if user hasn't manually overridden
      const manual = sessionStorage.getItem("manual-theme");
      if (!manual) {
        setTheme(target);
      }
    };

    applyTimeTheme();
    const interval = setInterval(applyTimeTheme, 60_000);
    return () => clearInterval(interval);
  }, [setTheme]);

  return null;
};

const TimeBasedThemeProvider = ({ children }: { children: React.ReactNode }) => (
  <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
    <TimeSync />
    {children}
  </ThemeProvider>
);

export default TimeBasedThemeProvider;
