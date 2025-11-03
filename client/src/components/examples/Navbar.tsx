import { Navbar } from "../Navbar";
import { ThemeProvider } from "../ThemeProvider";

export default function NavbarExample() {
  return (
    <ThemeProvider>
      <Navbar
        showMenu={true}
        user={{ email: "user@example.com" }}
        onMenuClick={() => console.log("Menu clicked")}
        onSettingsClick={() => console.log("Settings clicked")}
        onLogout={() => console.log("Logout clicked")}
      />
    </ThemeProvider>
  );
}
