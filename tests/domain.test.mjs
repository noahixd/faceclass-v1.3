import test from "node:test"; import assert from "node:assert/strict";
function checkIn({open,enrolled,already,confidence}) { if(!open) return {ok:false,code:"SESSION_CLOSED"}; if(!enrolled) return {ok:false,code:"NOT_ENROLLED"}; if(confidence<85) return {ok:false,code:"LOW_CONFIDENCE"}; if(already) return {ok:false,code:"DUPLICATE"}; return {ok:true,code:"CHECKED_IN"}; }
test("happy path: enrolled face is checked in",()=>assert.deepEqual(checkIn({open:true,enrolled:true,already:false,confidence:96}),{ok:true,code:"CHECKED_IN"}));
test("rejects recognition while session is closed",()=>assert.equal(checkIn({open:false,enrolled:true,already:false,confidence:96}).code,"SESSION_CLOSED"));
test("rejects a person outside the course",()=>assert.equal(checkIn({open:true,enrolled:false,already:false,confidence:96}).code,"NOT_ENROLLED"));
test("rejects confidence below threshold",()=>assert.equal(checkIn({open:true,enrolled:true,already:false,confidence:60}).code,"LOW_CONFIDENCE"));
test("prevents duplicate attendance",()=>assert.equal(checkIn({open:true,enrolled:true,already:true,confidence:96}).code,"DUPLICATE"));

function summarizeByCourse(history) {
  return Array.from(history.reduce((courses, item) => {
    const summary = courses.get(item.code) ?? { code:item.code, present:0, late:0, absent:0, total:0 };
    summary[item.status] += 1;
    summary.total += 1;
    courses.set(item.code, summary);
    return courses;
  }, new Map()).values());
}

test("student summary counts attendance separately for each course", () => {
  const result = summarizeByCourse([
    { code:"CS401", status:"present" },
    { code:"CS401", status:"late" },
    { code:"CS401", status:"absent" },
    { code:"IT201", status:"present" },
  ]);
  assert.deepEqual(result, [
    { code:"CS401", present:1, late:1, absent:1, total:3 },
    { code:"IT201", present:1, late:0, absent:0, total:1 },
  ]);
});
