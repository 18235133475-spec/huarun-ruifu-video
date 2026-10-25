"""统计本项目的 Claude Code 会话：Token、时间、迭代、工具、子智能体、渲染。按消息 id 全局去重（分叉会话会复制前缀）。"""
import json, glob, os, re, collections, datetime as dt
D = "/Users/luoyu/.claude/projects/-Users-luoyu--codex--chatgpt-projects-g-p-6ac7149e14508191b54a4bf069785fa5-----/"
mains = sorted(glob.glob(D + "*.jsonl"))
subs = sorted(glob.glob(D + "*/subagents/*.jsonl"))
seen_msg = {}           # message.id -> (usage, model, session, sidechain)
ts_by_sess = collections.defaultdict(list)
tool_calls = collections.Counter(); bash_cmds = []
user_turns = collections.defaultdict(int); user_ts = collections.defaultdict(list)
agent_spawns = []; seen_tool_ids = set()
def P(t): return dt.datetime.fromisoformat(t.replace("Z", "+00:00"))
for f in mains + subs:
    sess = os.path.basename(f).split(".")[0]
    is_sub = "/subagents/" in f
    parent = f.split("/")[-3] if is_sub else sess
    for line in open(f):
        try: o = json.loads(line)
        except Exception: continue
        t = o.get("timestamp")
        if t: ts_by_sess[parent].append(P(t))
        typ = o.get("type")
        if typ == "assistant":
            m = o.get("message", {}); mid = m.get("id")
            if not mid: continue
            seen_msg[mid] = (m.get("usage", {}), m.get("model"), parent, is_sub)
            for c in m.get("content", []) or []:
                if isinstance(c, dict) and c.get("type") == "tool_use" and c.get("id") not in seen_tool_ids:
                    seen_tool_ids.add(c["id"]); tool_calls[c["name"]] += 1
                    if c["name"] == "Bash": bash_cmds.append((t, c["input"].get("command", "")))
                    if c["name"] == "Agent": agent_spawns.append((t, c["input"].get("subagent_type", "general"), c["input"].get("description", ""), c["input"].get("run_in_background")))
        elif typ == "user" and not is_sub and not o.get("isMeta") and not o.get("isCompactSummary"):
            c = o.get("message", {}).get("content")
            txt = c if isinstance(c, str) else "".join(x.get("text", "") for x in c if isinstance(x, dict) and x.get("type") == "text") if isinstance(c, list) else ""
            if txt.strip() and not txt.lstrip().startswith(("<system-reminder", "<command-", "<local-command", "[Request interrupted", "This session is being continued", "<task-notification", "Caveat:")) and "task-notification" not in txt[:200]:
                key = (sess, txt[:200])
                if key in user_ts: continue
                user_ts[key] = t; user_turns[parent] += 1
# Token 汇总
tok = collections.defaultdict(lambda: collections.Counter())
for mid, (u, model, parent, is_sub) in seen_msg.items():
    k = (model, "子智能体" if is_sub else "主会话")
    tok[k]["calls"] += 1
    for f in ("input_tokens", "output_tokens", "cache_creation_input_tokens", "cache_read_input_tokens"):
        tok[k][f] += u.get(f, 0) or 0
    cc = u.get("cache_creation") or {}
    tok[k]["cw_5m"] += cc.get("ephemeral_5m_input_tokens", 0) or 0
    tok[k]["cw_1h"] += cc.get("ephemeral_1h_input_tokens", 0) or 0
# 时间
def active(ts, cap=30 * 60):
    ts = sorted(ts); a = 0
    for x, y in zip(ts, ts[1:]):
        g = (y - x).total_seconds(); a += min(g, cap) if g <= cap else 0
    return a
sess_rows = []
all_ts = []
for s, ts in ts_by_sess.items():
    ts = sorted(ts); all_ts += ts
    sess_rows.append((s, ts[0].astimezone().strftime("%m-%d %H:%M"), ts[-1].astimezone().strftime("%m-%d %H:%M"), round((ts[-1] - ts[0]).total_seconds() / 3600, 1), round(active(ts) / 3600, 1), user_turns[s]))
# 渲染
full = [c for t, c in bash_cmds if re.search(r"remotion render\S*\s.*full_raw", c)]
clips = [c for t, c in bash_cmds if "remotion render" in c and "full_raw" not in c]
stills = sum(len(re.findall(r"remotion still", c)) for t, c in bash_cmds)
loops = [c for t, c in bash_cmds if re.search(r"for .*remotion still", c)]
out = {"sessions": sess_rows, "tokens": {f"{k[0]}|{k[1]}": dict(v) for k, v in tok.items()}, "tools": tool_calls.most_common(), "agent_spawns": agent_spawns,
       "renders": {"full_film_cmds": len(full), "clip_render_cmds": len(clips), "still_cmds": stills, "still_loop_cmds": len(loops)},
       "span": [min(all_ts).astimezone().isoformat(), max(all_ts).astimezone().isoformat()], "active_total_h": round(active(all_ts) / 3600, 1)}
json.dump(out, open(os.path.dirname(__file__) + "/metrics_claude.json", "w"), ensure_ascii=False, indent=1, default=str)
for r in sess_rows: print(r)
for k, v in out["tokens"].items(): print(k, v)
print(out["tools"][:25]); print("agents", len(agent_spawns)); print(out["renders"]); print(out["span"], out["active_total_h"])
