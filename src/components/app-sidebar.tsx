"use client";

import {
  BarChart3,
  Files,
  LayoutDashboard,
  LogOut,
  Moon,
  Satellite,
  ScrollText,
  Share2,
  ShieldCheck,
  Sun,
  User,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const navItems = [
  {
    title: "Overview",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    title: "Files",
    href: "/dashboard/files",
    icon: Files,
  },
  {
    title: "Shared with Me",
    href: "/dashboard/shared",
    icon: Share2,
  },
  {
    title: "Nodes",
    href: "/dashboard/nodes",
    icon: Satellite,
  },
  {
    title: "Activity Log",
    href: "/dashboard/logs",
    icon: ScrollText,
  },
  {
    title: "Analytics",
    href: "/dashboard/analytics",
    icon: BarChart3,
  },
  {
    title: "Security",
    href: "/dashboard/security",
    icon: ShieldCheck,
  },
];

interface SessionUser {
  userId: string;
  name: string;
  email: string;
  role: string;
}

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then(async (r) => {
        if (!r.ok) {
          router.push("/login");
          router.refresh();
          return null;
        }
        return r.json();
      })
      .then((data) => {
        if (data?.user) setUser(data.user);
      })
      .catch(() => {});
  }, [router]);

  async function handleSignOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <Link
          href="/"
          className="flex items-center gap-2 text-sm font-bold tracking-wider"
        >
          <Satellite className="h-4 w-4 text-primary" />
          <span>
            FS-<span className="text-primary">LITE</span>
          </span>
        </Link>
        <p className="mt-1 text-[10px] uppercase tracking-widest text-muted-foreground">
          Orbital File System
        </p>
      </SidebarHeader>

      <Separator />

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] uppercase tracking-widest">
            Navigation
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const isActive =
                  pathname === item.href ||
                  (item.href !== "/dashboard" &&
                    pathname.startsWith(item.href));

                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      className=""
                    >
                      <Link href={item.href}>
                        <item.icon className="h-4 w-4" />
                        <span className="text-xs">{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4 space-y-3">
        {/* User profile */}
        {user && (
          <div className="border border-border p-3 space-y-1">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary">
                <User className="h-3 w-3" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-medium">{user.name}</p>
                <p className="truncate text-[10px] text-muted-foreground">{user.email}</p>
              </div>
            </div>
          </div>
        )}

        {/* Theme toggle */}
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-xs"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          <Sun className="h-3.5 w-3.5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-3.5 w-3.5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          Toggle Theme
        </Button>

        {/* Sign Out */}
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-xs text-muted-foreground hover:text-destructive"
          onClick={handleSignOut}
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign Out
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
