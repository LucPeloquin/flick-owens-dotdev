export default function PortfolioAppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <div className="portfolio-route-shell">{children}</div>;
}
