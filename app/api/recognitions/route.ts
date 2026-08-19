import { env } from "cloudflare:workers";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req:NextRequest){
  const token=req.headers.get("authorization")?.replace(/^Bearer\s+/i,"");
  if(!token) return NextResponse.json({error:"CAMERA_TOKEN_REQUIRED"},{status:401});
  let body:{sessionId?:string;studentId?:string;confidence?:number};
  try{body=await req.json()}catch{return NextResponse.json({error:"INVALID_JSON"},{status:400})}
  if(!body.sessionId||!body.studentId||typeof body.confidence!=="number") return NextResponse.json({error:"INVALID_INPUT"},{status:422});
  const session=await env.DB.prepare("SELECT id, course_id, camera_token_hash, closed_at FROM attendance_sessions WHERE id = ?").bind(body.sessionId).first<{id:string;course_id:string;camera_token_hash:string;closed_at:number|null}>();
  if(!session||session.closed_at) return NextResponse.json({error:"SESSION_CLOSED"},{status:409});
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token));
  const hash=Array.from(new Uint8Array(digest)).map(v=>v.toString(16).padStart(2,"0")).join("");
  if(hash!==session.camera_token_hash) return NextResponse.json({error:"INVALID_CAMERA_TOKEN"},{status:403});
  if(body.confidence<85) return NextResponse.json({error:"LOW_CONFIDENCE",reviewRequired:true},{status:422});
  const enrolled=await env.DB.prepare("SELECT 1 ok FROM enrollments WHERE course_id = ? AND student_id = ?").bind(session.course_id,body.studentId).first();
  if(!enrolled) return NextResponse.json({error:"NOT_ENROLLED"},{status:403});
  try{
    const id=crypto.randomUUID(),now=Date.now();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO attendance (id, session_id, student_id, recognized_at, confidence, source) VALUES (?, ?, ?, ?, ?, 'face')").bind(id,body.sessionId,body.studentId,now,Math.round(body.confidence)),
      env.DB.prepare("INSERT INTO notifications (id, user_id, title, message, created_at) VALUES (?, ?, 'เช็คชื่อสำเร็จ', 'ระบบบันทึกการเข้าเรียนของคุณแล้ว', ?)").bind(crypto.randomUUID(),body.studentId,now),
    ]);
    return NextResponse.json({id,status:"checked_in",recognizedAt:now},{status:201});
  }catch{return NextResponse.json({error:"DUPLICATE_ATTENDANCE"},{status:409})}
}
