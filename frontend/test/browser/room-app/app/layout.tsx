import "./fixture.css";
import Navigation from "@/components/layout/Navigation";

export default function Layout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="ja">
            <body>
                <main className="flex flex-col h-dvh w-full items-center">
                    <Navigation root>{children}</Navigation>
                </main>
            </body>
        </html>
    );
}
