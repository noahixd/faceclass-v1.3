import { env } from "cloudflare:workers";
import { NextRequest,NextResponse } from "next/server";
import { getChatGPTUser } from "../../chatgpt-auth";
async function sha(v:string){const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v));return Array.from(new Uint8Array(d)).map(x=>x.toString(16).padStart(2,"0")).join("")}
export async function POST(req:NextRequest){
  const identity=await getChatGPTUser(); if(!identity)return NextResponse.json({error:"UNAUTHENTICATED"},{status:401});
  const actor=await env.DB.prepare("SELECT id,role FROM users WHERE external_id=? AND active=1").bind(identity.userId).first<{id:string;role:string}>();
  if(!actor||!["teacher","admin"].includes(actor.role))return NextResponse.json({error:"FORBIDDEN"},{status:403});
  const {courseId}=await req.json() as {courseId?:string}; if(!courseId)return NextResponse.json({error:"COURSE_REQUIRED"},{status:422});
  const course=await env.DB.prepare("SELECT teacher_id FROM courses WHERE id=?").bind(courseId).first<{teacher_id:string}>();
  if(!course||(actor.role!=="admin"&&course.teacher_id!==actor.id))return NextResponse.json({error:"FORBIDDEN"},{status:403});
  const open=await env.DB.prepare("SELECT id FROM attendance_sessions WHERE course_id=? AND closed_at IS NULL").bind(courseId).first(); if(open)return NextResponse.json({error:"SESSION_ALREADY_OPEN"},{status:409});
  const id=crypto.randomUUID(),token=crypto.randomUUID()+crypto.randomUUID();
  await env.DB.prepare("INSERT INTO attendance_sessions(id,course_id,opened_by,opened_at,camera_status,camera_token_hash) VALUES(?,?,?,?,?,?)").bind(id,courseId,actor.id,Date.now(),"waiting",await sha(token)).run();
  return NextResponse.json({id,cameraToken:token,status:"open"},{status:201});
}
