import urllib.request as u, json

def run_test(name, query):
    q = {"query": query, "top_k": 3}
    d = json.dumps(q, ensure_ascii=False).encode()
    r = u.Request("http://localhost:8000/search", data=d, headers={"Content-Type": "application/json"})
    o = json.loads(u.urlopen(r, timeout=120).read().decode())
    print(name + " source_layer: " + str(o.get("source_layer")))
    for i, m in enumerate(o["results"]["metadatas"][0]):
        src = str(m.get("source", "?"))[:30]
        dom = str(m.get("domain", "?"))
        snippet = o["results"]["documents"][0][i][:80].replace("\n", " ")
        print("  [{}] {} ({})".format(i, src, dom))
        print("      " + snippet)

run_test("PLATFORM", "减脂平台期怎么办")
print("---")
run_test("DIET", "减脂期怎么吃外卖")
print("---")
run_test("KNEE", "深蹲时膝关节的生物力学机制")
