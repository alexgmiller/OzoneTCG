"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Laptop, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

const ICON_SIZE = 16;

// ── Theme switcher ──
// Light is the app default; the menu still offers Dark and System.
const ThemeSwitcher = () => {
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme } = useTheme();

  // Theme is only known on the client; render a same-size placeholder until then.
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return <span className="inline-block h-11 w-11" aria-hidden />;

  const Icon = theme === "light" ? Sun : theme === "dark" ? Moon : Laptop;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Change theme">
          <Icon size={ICON_SIZE} className="text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup value={theme} onValueChange={(v) => setTheme(v)}>
          <DropdownMenuRadioItem value="light">
            <Sun size={ICON_SIZE} className="text-muted-foreground" />
            <span>Light</span>
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <Moon size={ICON_SIZE} className="text-muted-foreground" />
            <span>Dark</span>
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <Laptop size={ICON_SIZE} className="text-muted-foreground" />
            <span>System</span>
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export { ThemeSwitcher };
