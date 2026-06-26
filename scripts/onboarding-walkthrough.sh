#!/usr/bin/env bash
# Live walkthrough of the AI-driven Guardian onboarding, hitting the real proxy
# (:8080) -> core_api (:3002) -> Gemini -> remote DB. Test Guardian only.
set -u
BASE="http://localhost:8080"
JAR="$(mktemp)"
ID="12345678"; SECRET="A1B2C3"

j() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const o=JSON.parse(s);console.log(eval(process.argv[1]))}catch(e){console.log("<<unparseable>>",s.slice(0,200))}})' "$1"; }

echo "============================================================"
echo "1) LOGIN as Guardian $ID"
LOGIN=$(curl -s -c "$JAR" -H "Content-Type: application/json" \
  -d "{\"guardian_id\":\"$ID\",\"guardian_secret\":\"$SECRET\"}" \
  "$BASE/auth/guardian-login")
echo "$LOGIN" | j 'o.success+" | name="+o.guardian.display_name+" | adventure="+o.guardian.adventure_key+" | is_first_login="+o.is_first_login'

# --- helper: create a fresh companion session, print its mode, echo the uuid ---
new_session() {
  local S
  S=$(curl -s -b "$JAR" "$BASE/api/v1/session?mode=companion")
  echo "   session.mode => $(echo "$S" | j 'o.session.mode')" 1>&2
  echo "$S" | j 'o.session.uuid'
}

# --- helper: send an onboarding message and read back Athena's AI reply ---
# args: <sessionId> <text> <firstContact:true|false> <priorAthenaLine>
say() {
  local SID="$1" TEXT="$2" FIRST="$3" PRIOR="$4"
  local BODY
  BODY=$(node -e 'console.log(JSON.stringify({sessionId:process.argv[1],text:process.argv[2],guardian:{display_name:"John Doe",adventure_key:"lake_norman_guardians"},onboarding:{priorAthenaLine:process.argv[4],firstContact:process.argv[3]==="true"}}))' "$SID" "$TEXT" "$FIRST" "$PRIOR")
  local CODE
  CODE=$(curl -s -b "$JAR" -o /tmp/_msg.json -w "%{http_code}" -H "Content-Type: application/json" -d "$BODY" "$BASE/api/v1/message")
  echo "   POST /message (text=\"$TEXT\") -> HTTP $CODE"
  if [ "$CODE" != "200" ]; then echo "   body: $(cat /tmp/_msg.json)"; return; fi
  sleep 6   # let Gemini respond (async) + persist
  curl -s -b "$JAR" "$BASE/api/v1/message?sessionId=$SID" \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const a=JSON.parse(s);const ai=a.filter(m=>!m.is_human).pop();console.log("   Athena =>",ai?JSON.stringify(ai.text):"(no AI reply yet)")})'
}

echo "============================================================"
echo "2) NEW GUARDIAN — communication check (2-char reply \"hi\" must be accepted)"
S1=$(new_session)
say "$S1" "hi" "true" "Before we begin… I'd like to know that our communication channel is working. You can type, or simply speak. Say hello."

echo "============================================================"
echo "3) RETURNING GUARDIAN — notebook = YES"
S2=$(new_session)
say "$S2" "yes I did" "false" "Welcome back, John. Did you bring your notebook?"

echo "============================================================"
echo "4) RETURNING GUARDIAN — notebook = NO"
S3=$(new_session)
say "$S3" "no, I forgot it at home" "false" "Welcome back, John. Did you bring your notebook?"

echo "============================================================"
echo "5) CONTROL — same short \"hi\" WITHOUT onboarding context must be rejected (min 3)"
S4=$(new_session)
CODE=$(curl -s -b "$JAR" -o /tmp/_ctl.json -w "%{http_code}" -H "Content-Type: application/json" \
  -d "{\"sessionId\":\"$S4\",\"text\":\"hi\"}" "$BASE/api/v1/message")
echo "   POST /message (text=\"hi\", no onboarding) -> HTTP $CODE | $(cat /tmp/_ctl.json)"

rm -f "$JAR"
echo "============================================================"
echo "DONE"
