import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "FaceClass — Presence, proven.", description: "ระบบเช็คชื่ออัจฉริยะด้วยการยืนยันตัวตนจากใบหน้า", openGraph:{title:"FaceClass",description:"Presence, proven.",images:["/og.png"]},twitter:{card:"summary_large_image",title:"FaceClass",description:"Presence, proven.",images:["/og.png"]} };
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="th"><body>{children}</body></html> }
