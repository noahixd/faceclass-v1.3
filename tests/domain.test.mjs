import test from "node:test"; import assert from "node:assert/strict";
function checkIn({open,enrolled,already,confidence}) { if(!open) return {ok:false,code:"SESSION_CLOSED"}; if(!enrolled) return {ok:false,code:"NOT_ENROLLED"}; if(confidence<85) return {ok:false,code:"LOW_CONFIDENCE"}; if(already) return {ok:false,code:"DUPLICATE"}; return {ok:true,code:"CHECKED_IN"}; }
test("happy path: enrolled face is checked in",()=>assert.deepEqual(checkIn({open:true,enrolled:true,already:false,confidence:96}),{ok:true,code:"CHECKED_IN"}));
test("rejects recognition while session is closed",()=>assert.equal(checkIn({open:false,enrolled:true,already:false,confidence:96}).code,"SESSION_CLOSED"));
test("rejects a person outside the course",()=>assert.equal(checkIn({open:true,enrolled:false,already:false,confidence:96}).code,"NOT_ENROLLED"));
test("rejects confidence below threshold",()=>assert.equal(checkIn({open:true,enrolled:true,already:false,confidence:60}).code,"LOW_CONFIDENCE"));
test("prevents duplicate attendance",()=>assert.equal(checkIn({open:true,enrolled:true,already:true,confidence:96}).code,"DUPLICATE"));
