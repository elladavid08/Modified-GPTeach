# X12: Stage-1 steering vs Stage-2 assessment in the live 2x2 runs, and what the students did on the same turn (aggregates only).
import json,glob,collections,re,os
R=__import__("os").path.join(__import__("os").path.dirname(__import__("os").path.abspath(__file__)),"../../replay_harness/results/")
def cls(v):
    v=[x for x in v if x in (0,1,2)]
    if not v: return None
    if all(x==2 for x in v): return 'strong'
    if 2 in v: return 'mixed'
    return 'incomplete' if 1 in v else 'weak'
ok=lambda l: l in ('CORRECT','CORRECT_JUSTIFIED')
tot=collections.Counter(); grid=collections.defaultdict(lambda: collections.Counter())
byturn=collections.defaultdict(lambda: collections.Counter())
for run in ['X12P-L-cur','X12P-L-pac','X12P-F-cur','X12P-F-pac']:
    labels=json.load(open(R+run+'/arc_labels.json'))
    lab=collections.defaultdict(list)
    for x in labels: lab[(x['conv'],x['turn'])].append(x)
    for f in glob.glob(R+run+'/conversations/*.json'):
        c=json.load(open(f))
        for t in c['turns']:
            tk=t['label'].split(' ')[0]; p=t['pck']
            if not (t.get('stage2') and t['stage2'].get('rows')): continue
            pos = p.get('quality')=='positive' and p.get('understanding')=='improved'
            s2=cls([r['score'] for r in t['stage2']['rows']])
            tot[(pos,s2)]+=1
            if tk in ('T6','T7','T8','T9','T10'):
                xs=lab[(c['conversationId'],tk)]
                peer_conf=any((not x['carrier']) and ok(x['label']) and '?' not in x['text'] for x in xs)
                car=[x for x in xs if x['carrier'] and x['label']!='OTHER']
                car_conf=any(ok(x['label']) and '?' not in x['text'] for x in car)
                g=grid[(pos, s2 in ('weak','incomplete'))]; g['n']+=1; g['peer_conf']+=peer_conf; g['car_conf']+=car_conf
                if tk in ('T6','T7'):
                    b=byturn[(tk,pos, s2 in ('weak','incomplete'))]; b['n']+=1; b['peer_conf']+=peer_conf; b['car_conf']+=car_conf
print('live shown turns by (steer positive, Stage-2 class):')
for pos in (True,False):
    print('  steer positive' if pos else '  steer not positive', {k[1]:v for k,v in tot.items() if k[0]==pos})
print('\nteaching turns T6-T10: confident correct conclusion in the replies to this move')
for k,v in sorted(grid.items()):
    print(f"  steer {'positive' if k[0] else 'other   '} | Stage 2 {'max<=1 ' if k[1] else 'has a 2'}: n {v['n']:3d}  peer {v['peer_conf']:3d} ({100*v['peer_conf']/v['n']:.0f}%)  carrier {v['car_conf']:3d} ({100*v['car_conf']/v['n']:.0f}%)")
print('\nminimal-teaching turns only (T6 hint, T7 rethink):')
for k,v in sorted(byturn.items()):
    print(f"  {k[0]} steer {'positive' if k[1] else 'other   '} | Stage 2 {'max<=1 ' if k[2] else 'has a 2'}: n {v['n']:3d}  peer {v['peer_conf']} ({100*v['peer_conf']/v['n']:.0f}%)  carrier {v['car_conf']} ({100*v['car_conf']/v['n']:.0f}%)")
