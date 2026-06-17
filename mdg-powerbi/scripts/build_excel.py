#!/usr/bin/env python3
"""
Build MDG_Executive_Dashboard.xlsx from the star-schema CSVs in data/.

Self-contained, immediately-usable executive workbook (real QuickBooks +
Knowify data) with: Command Center, P&L, Division Performance, Project
Tracker, WIP & Profit Fade, AR/AP Aging, Cash & Liquidity, Balance Sheet,
Data Health, plus the raw data tables for pivoting. Also a clean import
source for Power BI.
"""
import csv, os, json, datetime as dt
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side, NamedStyle
from openpyxl.utils import get_column_letter
from openpyxl.chart import BarChart, LineChart, Reference, Series
from openpyxl.formatting.rule import CellIsRule, ColorScaleRule, DataBarRule
from openpyxl.worksheet.table import Table, TableStyleInfo

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DATA = os.path.join(ROOT, "data")
OUT  = os.path.join(ROOT, "output", "MDG_Executive_Dashboard.xlsx")
os.makedirs(os.path.dirname(OUT), exist_ok=True)

def rd(name):
    with open(os.path.join(DATA, name), encoding="utf-8") as f:
        return list(csv.DictReader(f))
def f(x):
    try: return float(x)
    except (TypeError, ValueError): return 0.0

# ---- load data ----
gl   = rd("Fact_GL.csv")
mon  = rd("Fact_PL_Monthly.csv")
wip  = rd("Fact_WIP.csv")
ar   = rd("Fact_AR.csv")
ap   = rd("Fact_AP.csv")
cash = rd("Fact_Cash.csv")[0]
bsheet = rd("Fact_BalanceSheet.csv")
budget = rd("Fact_Budget.csv")
divs = {r["DivKey"]: r for r in rd("Dim_Division.csv")}
params = rd("Param_Cash.csv")
recon = json.load(open(os.path.join(DATA, "_reconciliation.json")))
AS_OF = recon["as_of"]

# ---- Dark, restrained dashboard palette (3-color discipline: accent / neutral / base) ----
FONT="Segoe UI"
BASE="15171F"      # base background
CARD="1E222D"      # card surface
CARD2="262B38"     # header / elevated surface
RULE="313747"      # hairline borders
ACCENT="029CF5"    # the ONE emphasis color
NEUTRAL="6E7585"   # all non-highlighted data
INK="FFFFFF"; SUBINK="9AA3B2"           # text: primary / muted label
GOOD="35C77F"; BAD="FF6B6B"; WARN="F4B740"
WHITE="FFFFFF"
# back-compat aliases — inline fills/text across the sheets adopt the dark scheme
NAVY=CARD2; NAVY2=CARD2; TEAL=ACCENT; ORANGE=NEUTRAL; PURPLE=NEUTRAL
GREEN=GOOD; RED=BAD; AMBER=WARN; LIGHT=CARD; GREY=SUBINK; HEADER=CARD2
# divisions: accent for the lead, grayscale ramp for the rest (no rainbow)
DIV_COLORS={"TI":ACCENT,"MF":"4F8FC7","DW":NEUTRAL,"EN":"515967","UN":"3A4150"}

thin=Side(style="thin",color=RULE)
border=Border(left=thin,right=thin,top=thin,bottom=thin)
def fill(c): return PatternFill("solid",fgColor=c)
def money(cell): cell.number_format='#,##0'
def money2(cell): cell.number_format='$#,##0'
def pct(cell): cell.number_format='0.0%'

from openpyxl.chart.shapes import GraphicalProperties
from openpyxl.drawing.line import LineProperties

wb=Workbook()

def sheet(title, tab=ACCENT):
    ws=wb.create_sheet(title)
    ws.sheet_properties.tabColor=tab
    ws.sheet_view.showGridLines=False
    return ws

def title_block(ws, title, sub):
    # Dark header: base ground, white title, muted subtitle, accent rule
    ws.merge_cells("A1:N1"); c=ws["A1"]
    c.value=title; c.font=Font(name=FONT,size=18,bold=True,color=INK); c.fill=fill(BASE)
    c.alignment=Alignment(vertical="center",horizontal="left",indent=1)
    ws.row_dimensions[1].height=32
    ws.merge_cells("A2:N2"); s=ws["A2"]
    s.value=sub; s.font=Font(name=FONT,size=10,color=SUBINK); s.fill=fill(BASE)
    s.alignment=Alignment(vertical="center",horizontal="left",indent=1)
    ws.row_dimensions[2].height=17
    accent=Side(style="medium",color=ACCENT)
    for col in range(1,15):
        ws.cell(row=2,column=col).border=Border(bottom=accent)

def hdr(ws,row,cols,startcol=1,fillc=CARD2):
    # Quiet header: elevated dark ground, muted-gray labels, hairline rule
    for i,h in enumerate(cols):
        cell=ws.cell(row=row,column=startcol+i,value=h)
        cell.font=Font(name=FONT,bold=True,color=SUBINK,size=9); cell.fill=fill(fillc)
        cell.alignment=Alignment(horizontal="center",vertical="center",wrap_text=True)
        cell.border=Border(bottom=Side(style="thin",color=RULE))
    ws.row_dimensions[row].height=26

# ===========================================================================
# Aggregates
# ===========================================================================
def period_cat(period, cat):
    return sum(f(r["Amount"]) for r in gl if r["Period"]==period and r["Category"]==cat)
P=["FY2024","FY2025","YTD2026"]
agg={}
for p in P:
    rev=period_cat(p,"Revenue"); cogs=period_cat(p,"COGS"); opex=period_cat(p,"Operating Expense")
    oi=period_cat(p,"Other Income"); oe=period_cat(p,"Other Expense")
    gp=rev-cogs; ni=gp-opex+oi-oe
    agg[p]=dict(rev=rev,cogs=cogs,gp=gp,opex=opex,oi=oi,oe=oe,ni=ni,
                gm=gp/rev if rev else 0, nm=ni/rev if rev else 0)

# YTD 2026 completed-month run-rate forecast (Jan-May complete)
m2026=[r for r in mon if r["MonthEnd"].startswith("2026")]
complete=[r for r in m2026 if r["MonthEnd"]<="2026-05-31"]
ytd_complete_rev=sum(f(r["Revenue"]) for r in complete)
ytd_complete_ni=sum(f(r["NetIncome"]) for r in complete)
months_done=len(complete)
fc_rev=ytd_complete_rev/months_done*12 if months_done else 0
fc_ni=ytd_complete_ni/months_done*12 if months_done else 0

# WIP / jobs
contract_total=sum(f(r["ContractTotal"]) for r in wip)
invoiced_total=sum(f(r["Invoiced"]) for r in wip)
backlog=contract_total-invoiced_total
profit_total=sum(f(r["ProfitAmount"]) for r in wip)
overbilled=sum(f(r["Overbilled"]) for r in wip)
underbilled=sum(f(r["Underbilled"]) for r in wip)
managed=[r for r in wip if r["Managed"]=="TRUE"]
jobs_fading=[r for r in managed if f(r["ProfitFadePct"])<-0.02]
no_pm=[r for r in wip if r["PMName"]=="(Unassigned)"]
no_budget=[r for r in wip if r["HasBudget"]=="FALSE"]

# AR / AP
ar_trade=[r for r in ar if r["IsRetainage"]=="FALSE"]
ar_total=sum(f(r["Amount"]) for r in ar_trade)
retainage=sum(f(r["Amount"]) for r in ar if r["IsRetainage"]=="TRUE")
ap_total=sum(f(r["Amount"]) for r in ap)

# Cash / LOC
cash_bal=f(cash["CashBalance"]); loc_drawn=f(cash["LOCDrawn"]); loc_limit=f(cash["LOCLimit"])
adv=f(cash["AdvanceRate"]); elig=f(cash["EligibleAR"])
loc_util=loc_drawn/loc_limit if loc_limit else 0
bbc=min(elig*adv,loc_limit)-loc_drawn
unalloc=sum(f(r["Amount"]) for r in gl if r["DivKey"]=="UN")

# ===========================================================================
# 1. COMMAND CENTER
# ===========================================================================
ws=wb.active; ws.title="Command Center"; ws.sheet_properties.tabColor=NAVY
ws.sheet_view.showGridLines=False
title_block(ws,"MIDWEST DESIGN GROUP — Executive Command Center",
            f"CEO / CFO view  •  Live QuickBooks + Knowify  •  As of {AS_OF}  •  All figures real, reconciled to source")

def _ban(ws,col,label,value,fmt,sub,color=None,r0=4,vsize=20):
    # KPI card (BAN): dark card, muted uppercase label, big white number, colored delta line.
    vcolor=color or INK; edge=Side(style="thin",color=RULE)
    ws.merge_cells(start_row=r0,start_column=col,end_row=r0,end_column=col+1)
    c=ws.cell(row=r0,column=col,value=label.upper()); c.font=Font(name=FONT,bold=True,size=8,color=SUBINK)
    c.fill=fill(CARD); c.alignment=Alignment(horizontal="left",vertical="center",indent=1)
    ws.cell(row=r0,column=col+1).fill=fill(CARD)
    ws.merge_cells(start_row=r0+1,start_column=col,end_row=r0+2,end_column=col+1)
    v=ws.cell(row=r0+1,column=col,value=value); v.font=Font(name=FONT,bold=True,size=vsize,color=vcolor)
    v.alignment=Alignment(horizontal="left",vertical="center",indent=1); v.number_format=fmt; v.fill=fill(CARD)
    ws.cell(row=r0+2,column=col).fill=fill(CARD); ws.cell(row=r0+1,column=col+1).fill=fill(CARD); ws.cell(row=r0+2,column=col+1).fill=fill(CARD)
    ws.merge_cells(start_row=r0+3,start_column=col,end_row=r0+3,end_column=col+1)
    s=ws.cell(row=r0+3,column=col,value=sub); s.font=Font(name=FONT,bold=bool(color),size=8,color=(color or SUBINK))
    s.alignment=Alignment(horizontal="left",vertical="center",indent=1); s.fill=fill(CARD)
    ws.cell(row=r0+3,column=col+1).fill=fill(CARD)
    for rr in range(r0,r0+4):
        for cc in (col,col+1):
            cell=ws.cell(row=rr,column=cc)
            cell.border=Border(top=edge if rr==r0 else None, bottom=edge if rr==r0+3 else None,
                               left=edge if cc==col else None, right=edge if cc==col+1 else None)

def kpi(ws,col,label,value,fmt,sub,color=None):
    _ban(ws,col,label,value,fmt,sub,color,r0=4,vsize=18)

y=agg["YTD2026"]
kpi(ws,1,"YTD REVENUE",y["rev"],'$#,##0',"through "+AS_OF)
kpi(ws,3,"GROSS MARGIN",y["gm"],'0.0%',f"GP ${y['gp']:,.0f}")
kpi(ws,5,"NET INCOME",y["ni"],'$#,##0',f"{y['nm']*100:.1f}% margin")
kpi(ws,7,"CASH",cash_bal,'$#,##0',"BS cash", RED if cash_bal<0 else GREEN)
kpi(ws,9,"TRADE A/R",ar_total,'$#,##0',f"+ ${retainage:,.0f} retainage")
kpi(ws,11,"BACKLOG",backlog,'$#,##0',f"{len(wip)} active jobs")
kpi(ws,13,"LOC USE",loc_util,'0.0%',f"${loc_drawn:,.0f} drawn", RED if loc_util>=0.9 else (AMBER if loc_util>=0.75 else GREEN))

# Forecast cards rendered in the second band (kpi2) below.
def kpi2(ws,col,label,value,fmt,sub,color=None,r0=10):
    _ban(ws,col,label,value,fmt,sub,color,r0=r0,vsize=16)
kpi2(ws,1,"2026 FORECAST REV",fc_rev,'$#,##0',f"run-rate ×{months_done}mo complete")
kpi2(ws,3,"2026 FORECAST NI",fc_ni,'$#,##0',f"{fc_ni/fc_rev*100 if fc_rev else 0:.1f}% margin")
kpi2(ws,5,"MANAGED JOBS",len(managed),'0',f"of {len(wip)} active")
kpi2(ws,7,"JOBS FADING",len(jobs_fading),'0',"margin fade < -2%", RED if jobs_fading else GREEN)
kpi2(ws,9,"OVERBILLED",overbilled,'$#,##0',"billed ahead of work")
kpi2(ws,11,"UNDERBILLED",underbilled,'$#,##0',"work ahead of billing")
kpi2(ws,13,"BBC HEADROOM",bbc,'$#,##0',"borrowing-base avail", RED if bbc<0 else GREEN)

# Monthly revenue/NI table for chart (2026)
r0=16
ws.cell(row=r0,column=1,value="2026 Monthly Trend (verified single-month QuickBooks P&L)").font=Font(bold=True,size=11,color=NAVY)
hdr(ws,r0+1,["Month","Revenue","Gross Profit","Net Income","GM %"])
rr=r0+2
for m in sorted(m2026,key=lambda x:x["MonthEnd"]):
    ws.cell(row=rr,column=1,value=m["MonthEnd"][:7])
    for ci,key in [(2,"Revenue"),(3,"GrossProfit"),(4,"NetIncome")]:
        cc=ws.cell(row=rr,column=ci,value=f(m[key])); money2(cc)
    gmc=ws.cell(row=rr,column=5,value=f(m["GrossMarginPct"])); pct(gmc)
    for ci in range(1,6): ws.cell(row=rr,column=ci).border=border
    rr+=1
data_end=rr-1
# Revenue/NI line chart
chart=LineChart(); chart.title="2026 Revenue & Net Income by Month"; chart.height=7; chart.width=16
chart.style=2
data=Reference(ws,min_col=2,max_col=4,min_row=r0+1,max_row=data_end)
cats=Reference(ws,min_col=1,min_row=r0+2,max_row=data_end)
chart.add_data(data,titles_from_data=True); chart.set_categories(cats)
ws.add_chart(chart,f"G{r0+1}")

# Division contribution table + bar
r1=rr+1
ws.cell(row=r1,column=1,value="Division Contribution (Knowify active jobs)").font=Font(bold=True,size=11,color=NAVY)
hdr(ws,r1+1,["Division","Contract","Invoiced","Profit $","Profit %"])
divagg={}
for r in wip:
    d=divagg.setdefault(r["DivKey"],[0,0,0])
    d[0]+=f(r["ContractTotal"]); d[1]+=f(r["Invoiced"]); d[2]+=f(r["ProfitAmount"])
rr=r1+2
for dk in ["TI","MF","DW","EN","UN"]:
    if dk not in divagg: continue
    v=divagg[dk]
    ws.cell(row=rr,column=1,value=divs.get(dk,{}).get("Division",dk))
    c2=ws.cell(row=rr,column=2,value=v[0]); money2(c2)
    c3=ws.cell(row=rr,column=3,value=v[1]); money2(c3)
    c4=ws.cell(row=rr,column=4,value=v[2]); money2(c4)
    c5=ws.cell(row=rr,column=5,value=v[2]/v[0] if v[0] else 0); pct(c5)
    for ci in range(1,6): ws.cell(row=rr,column=ci).border=border
    rr+=1
bar=BarChart(); bar.title="Contract vs Invoiced by Division"; bar.height=7; bar.width=16; bar.style=10
bdata=Reference(ws,min_col=2,max_col=3,min_row=r1+1,max_row=rr-1)
bcats=Reference(ws,min_col=1,min_row=r1+2,max_row=rr-1)
bar.add_data(bdata,titles_from_data=True); bar.set_categories(bcats)
ws.add_chart(bar,f"G{r1+1}")

# Exceptions strip
r2=rr+1
ws.cell(row=r2,column=1,value="⚠ EXCEPTIONS").font=Font(bold=True,size=12,color="FFFFFF")
ws.cell(row=r2,column=1).fill=fill(RED)
for cc in range(1,7): ws.cell(row=r2,column=cc).fill=fill(RED)
exrows=[
    (f"{len(jobs_fading)} managed jobs with profit fade worse than -2%", "Project Tracker"),
    (f"Cash position negative: ${cash_bal:,.0f}", "Cash & Liquidity"),
    (f"LOC utilization {loc_util*100:.0f}% (${loc_drawn:,.0f} of ${loc_limit:,.0f})", "Cash & Liquidity"),
    (f"Overbilling ${overbilled:,.0f} — billed ahead of work (cash borrowed from jobs)", "WIP & Profit Fade"),
    (f"{len(no_pm)} active jobs with no Project Manager assigned", "Data Health"),
    (f"{len(no_budget)} active jobs with no budget loaded", "Data Health"),
    (f"${unalloc:,.0f} GL in UNALLOCATED division", "Data Health"),
]
rr=r2+1
for txt,where in exrows:
    ws.cell(row=rr,column=1,value="•  "+txt).font=Font(size=10,color=NAVY)
    ws.merge_cells(start_row=rr,start_column=1,end_row=rr,end_column=5)
    ws.cell(row=rr,column=6,value=where).font=Font(size=9,italic=True,color=GREY)
    rr+=1
ws.column_dimensions["A"].width=30
for col in "BCDEF": ws.column_dimensions[col].width=15
for col in "GHIJKLMN": ws.column_dimensions[col].width=11

# ===========================================================================
# helper to dump a table sheet
# ===========================================================================
def table_sheet(name, rows, headers, tab=NAVY2, money_cols=(), pct_cols=(), title=None, sub=None,
                cond_red_neg=()):
    ws=sheet(name,tab)
    if title:
        title_block(ws,title,sub or "")
        top=4
    else:
        top=1
    hdr(ws,top,headers)
    r=top+1
    for row in rows:
        for ci,h in enumerate(headers):
            val=row.get(h)
            try: val=float(val) if (h in money_cols or h in pct_cols) else val
            except (TypeError,ValueError): pass
            cell=ws.cell(row=r,column=ci+1,value=val)
            cell.border=border
            if h in money_cols: cell.number_format='$#,##0'
            if h in pct_cols: cell.number_format='0.0%'
        r+=1
    # widths
    for ci,h in enumerate(headers):
        ws.column_dimensions[get_column_letter(ci+1)].width=max(12,min(40,len(h)+4))
    # conditional formatting red negatives
    for h in cond_red_neg:
        if h in headers:
            col=get_column_letter(headers.index(h)+1)
            ws.conditional_formatting.add(f"{col}{top+1}:{col}{r-1}",
                CellIsRule(operator="lessThan",formula=["0"],
                           font=Font(color=RED,bold=True)))
    return ws,top,r-1

# ===========================================================================
# 2. P&L
# ===========================================================================
ws=sheet("P&L",NAVY2)
title_block(ws,"Profit & Loss","Company P&L from QuickBooks  •  FY2024 / FY2025 / YTD2026  •  reconciled to QB section totals")
hdr(ws,4,["Line","FY2024","FY2025",f"YTD2026 ({AS_OF})"])
def pl_line(ws,r,label,vals,bold=False,fillc=None,pctrow=False):
    c=ws.cell(row=r,column=1,value=label); c.font=Font(bold=bold,color=(WHITE if fillc else NAVY))
    if fillc: c.fill=fill(fillc)
    for i,v in enumerate(vals):
        cell=ws.cell(row=r,column=2+i,value=v); cell.font=Font(bold=bold,color=(WHITE if fillc else NAVY))
        cell.number_format='0.0%' if pctrow else '$#,##0'
        if fillc: cell.fill=fill(fillc)
        cell.border=border
    ws.cell(row=r,column=1).border=border
r=5
pl_line(ws,r,"Revenue",[agg[p]["rev"] for p in P],bold=True,fillc=NAVY); r+=1
# revenue accounts
for cat,lbl in [("Revenue","")]:
    accts=sorted(set(x["Account"] for x in gl if x["Category"]=="Revenue"))
    for a in accts:
        vals=[sum(f(x["Amount"]) for x in gl if x["Account"]==a and x["Period"]==p) for p in P]
        if any(abs(v)>0.5 for v in vals):
            pl_line(ws,r,"   "+a,vals); r+=1
pl_line(ws,r,"Cost of Goods Sold",[agg[p]["cogs"] for p in P],bold=True,fillc=NAVY2); r+=1
pl_line(ws,r,"Gross Profit",[agg[p]["gp"] for p in P],bold=True,fillc=TEAL); r+=1
pl_line(ws,r,"Gross Margin %",[agg[p]["gm"] for p in P],bold=True,pctrow=True); r+=1
pl_line(ws,r,"Operating Expenses",[agg[p]["opex"] for p in P],bold=True,fillc=NAVY2); r+=1
pl_line(ws,r,"Other Income",[agg[p]["oi"] for p in P]); r+=1
pl_line(ws,r,"Other Expense",[agg[p]["oe"] for p in P]); r+=1
pl_line(ws,r,"NET INCOME",[agg[p]["ni"] for p in P],bold=True,fillc=NAVY); r+=1
pl_line(ws,r,"Net Margin %",[agg[p]["nm"] for p in P],bold=True,pctrow=True); r+=1
ws.column_dimensions["A"].width=42
for col in "BCD": ws.column_dimensions[col].width=18
# annual revenue/NI bar
r+=2
ws.cell(row=r,column=1,value="Annual Revenue / Gross Profit / Net Income").font=Font(bold=True,color=NAVY)
hdr(ws,r+1,["Period","Revenue","Gross Profit","Net Income"])
for i,p in enumerate(P):
    ws.cell(row=r+2+i,column=1,value=p)
    for ci,k in [(2,"rev"),(3,"gp"),(4,"ni")]:
        cc=ws.cell(row=r+2+i,column=ci,value=agg[p][k]); cc.number_format='$#,##0'; cc.border=border
    ws.cell(row=r+2+i,column=1).border=border
bar=BarChart(); bar.title="Revenue / GP / Net Income by Year"; bar.height=8; bar.width=18; bar.style=10
bar.add_data(Reference(ws,min_col=2,max_col=4,min_row=r+1,max_row=r+1+len(P)),titles_from_data=True)
bar.set_categories(Reference(ws,min_col=1,min_row=r+2,max_row=r+1+len(P)))
ws.add_chart(bar,f"F{r+1}")

# ===========================================================================
# 3. Division Performance
# ===========================================================================
ws=sheet("Division Performance",TEAL)
title_block(ws,"Division Performance","Per-division contract, billing, cost & margin (Knowify active jobs)")
hdr(ws,4,["Division","Jobs","Contract","Invoiced","Budget Cost","Actual Cost","Profit $","Profit %","WIP Net"])
r=5
for dk in ["TI","MF","DW","EN","UN"]:
    jr=[x for x in wip if x["DivKey"]==dk]
    if not jr: continue
    contract=sum(f(x["ContractTotal"]) for x in jr); inv=sum(f(x["Invoiced"]) for x in jr)
    bud=sum(f(x["BudgetTotal"]) for x in jr); act=sum(f(x["ActualCost"]) for x in jr)
    prof=sum(f(x["ProfitAmount"]) for x in jr); wipn=sum(f(x["WIPNet"]) for x in jr)
    vals=[divs.get(dk,{}).get("Division",dk),len(jr),contract,inv,bud,act,prof,prof/contract if contract else 0,wipn]
    for ci,v in enumerate(vals):
        cell=ws.cell(row=r,column=ci+1,value=v); cell.border=border
        if ci in (2,3,4,5,6,8): cell.number_format='$#,##0'
        if ci==7: cell.number_format='0.0%'
    r+=1
ws.column_dimensions["A"].width=22
for col in "BCDEFGHI": ws.column_dimensions[col].width=15
ws.conditional_formatting.add(f"G5:G{r-1}",CellIsRule(operator="lessThan",formula=["0"],font=Font(color=RED,bold=True)))
ws.conditional_formatting.add(f"I5:I{r-1}",CellIsRule(operator="lessThan",formula=["0"],font=Font(color=RED,bold=True)))
bar=BarChart(); bar.type="col"; bar.title="Profit $ by Division"; bar.height=8; bar.width=16; bar.style=12
bar.add_data(Reference(ws,min_col=7,max_col=7,min_row=4,max_row=r-1),titles_from_data=True)
bar.set_categories(Reference(ws,min_col=1,min_row=5,max_row=r-1))
ws.add_chart(bar,f"A{r+2}")

# ===========================================================================
# 4. Project Tracker (managed jobs ranked by profit fade)
# ===========================================================================
mrows=sorted(managed,key=lambda r:f(r["ProfitFadePct"]))
cols=["Job","DivKey","PMName","Customer","ContractTotal","PctComplete","ProjectedProfitPct","EstMarginPct","ProfitFadePct","WIPNet","OpenAR"]
disp=["Job","Div","PM","Customer","Contract","% Comp","Proj Margin","Est Margin","Profit Fade","WIP Net","Open A/R"]
ws=sheet("Project Tracker",ORANGE)
title_block(ws,"Project Tracker — Profit Fade Watch",
            f"{len(managed)} managed jobs ranked worst-fade first  •  fade = forecast margin − as-bid budget margin")
hdr(ws,4,disp)
r=5
for row in mrows:
    out=[row["Job"],row["DivKey"],row["PMName"],row["Customer"],f(row["ContractTotal"]),
         f(row["PctComplete"]),f(row["ProjectedProfitPct"]),f(row["EstMarginPct"]),
         f(row["ProfitFadePct"]),f(row["WIPNet"]),f(row["OpenAR"])]
    for ci,v in enumerate(out):
        cell=ws.cell(row=r,column=ci+1,value=v); cell.border=border
        if ci==4 or ci==9 or ci==10: cell.number_format='$#,##0'
        if ci in (5,6,7,8): cell.number_format='0.0%'
    r+=1
widths=[34,6,16,28,14,9,12,12,12,13,13]
for ci,w in enumerate(widths): ws.column_dimensions[get_column_letter(ci+1)].width=w
ws.conditional_formatting.add(f"I5:I{r-1}",ColorScaleRule(start_type="num",start_value=-0.2,start_color=RED,
    mid_type="num",mid_value=0,mid_color="FFFF99",end_type="num",end_value=0.2,end_color=GREEN))
ws.conditional_formatting.add(f"J5:J{r-1}",CellIsRule(operator="lessThan",formula=["0"],font=Font(color=RED,bold=True)))
ws.freeze_panes="A5"

# ===========================================================================
# 5. WIP & Profit Fade by PM
# ===========================================================================
ws=sheet("WIP & Profit Fade",PURPLE)
title_block(ws,"WIP & Profit Fade — by Project Manager",
            "Over/under-billing and margin fade concentration  •  Knowify AJR")
hdr(ws,4,["Project Manager","Jobs","Contract","Earned Rev","Invoiced","Overbilled","Underbilled","Profit $","Avg Fade"])
pmagg={}
for row in wip:
    pm=row["PMName"]; a=pmagg.setdefault(pm,[0,0,0,0,0,0,0,[]])
    a[0]+=1; a[1]+=f(row["ContractTotal"]); a[2]+=f(row["EarnedRevenue"]); a[3]+=f(row["Invoiced"])
    a[4]+=f(row["Overbilled"]); a[5]+=f(row["Underbilled"]); a[6]+=f(row["ProfitAmount"])
    if row["Managed"]=="TRUE": a[7].append(f(row["ProfitFadePct"]))
r=5
for pm in sorted(pmagg,key=lambda k:-pmagg[k][1]):
    a=pmagg[pm]; avgfade=sum(a[7])/len(a[7]) if a[7] else 0
    vals=[pm,a[0],a[1],a[2],a[3],a[4],a[5],a[6],avgfade]
    for ci,v in enumerate(vals):
        cell=ws.cell(row=r,column=ci+1,value=v); cell.border=border
        if ci in (2,3,4,5,6,7): cell.number_format='$#,##0'
        if ci==8: cell.number_format='0.0%'
    r+=1
ws.column_dimensions["A"].width=20
for col in "BCDEFGHI": ws.column_dimensions[col].width=14
ws.conditional_formatting.add(f"I5:I{r-1}",CellIsRule(operator="lessThan",formula=["0"],font=Font(color=RED,bold=True)))

# ===========================================================================
# 6. AR Aging
# ===========================================================================
ws=sheet("AR Aging",NAVY2)
title_block(ws,"Accounts Receivable Aging",
            f"By customer & bucket (QuickBooks, as of {AS_OF})  •  retainage shown separately")
ARB=["Current","1-30","31-60","61-90","91+"]
hdr(ws,4,["Customer"]+ARB+["Total"])
custmap={}
for row in ar_trade:
    custmap.setdefault(row["Customer"],{b:0 for b in ARB})[row["Bucket"]]+=f(row["Amount"])
r=5
for cust in sorted(custmap,key=lambda c:-sum(custmap[c].values())):
    vals=custmap[cust]; tot=sum(vals.values())
    ws.cell(row=r,column=1,value=cust).border=border
    for i,b in enumerate(ARB):
        cc=ws.cell(row=r,column=2+i,value=vals[b]); cc.number_format='$#,##0'; cc.border=border
    tc=ws.cell(row=r,column=7,value=tot); tc.number_format='$#,##0'; tc.font=Font(bold=True); tc.border=border
    r+=1
# totals row
ws.cell(row=r,column=1,value="TOTAL TRADE A/R").font=Font(bold=True,color=WHITE); ws.cell(row=r,column=1).fill=fill(NAVY)
for i,b in enumerate(ARB):
    cc=ws.cell(row=r,column=2+i,value=sum(custmap[c][b] for c in custmap)); cc.number_format='$#,##0'; cc.font=Font(bold=True,color=WHITE); cc.fill=fill(NAVY)
tc=ws.cell(row=r,column=7,value=ar_total); tc.number_format='$#,##0'; tc.font=Font(bold=True,color=WHITE); tc.fill=fill(NAVY)
r+=1
ws.cell(row=r,column=1,value="Retainage Receivable (held, not aging)").font=Font(italic=True,color=NAVY)
rc=ws.cell(row=r,column=7,value=retainage); rc.number_format='$#,##0'; rc.font=Font(bold=True,color=PURPLE)
ws.column_dimensions["A"].width=42
for col in "BCDEFG": ws.column_dimensions[col].width=14
ws.freeze_panes="A5"

# ===========================================================================
# 7. AP Aging
# ===========================================================================
ws=sheet("AP Aging",NAVY2)
title_block(ws,"Accounts Payable Aging",f"By vendor & bucket (QuickBooks, as of {AS_OF})")
APB=["Current","1-30","31-60","61-90","91+"]
hdr(ws,4,["Vendor"]+APB+["Total"])
vmap={}
for row in ap:
    vmap.setdefault(row["Vendor"],{b:0 for b in APB})[row["Bucket"]]+=f(row["Amount"])
r=5
for v in sorted(vmap,key=lambda c:-sum(vmap[c].values())):
    vals=vmap[v]; tot=sum(vals.values())
    ws.cell(row=r,column=1,value=v).border=border
    for i,b in enumerate(APB):
        cc=ws.cell(row=r,column=2+i,value=vals[b]); cc.number_format='$#,##0'; cc.border=border
    tc=ws.cell(row=r,column=7,value=tot); tc.number_format='$#,##0'; tc.font=Font(bold=True); tc.border=border
    r+=1
ws.cell(row=r,column=1,value="TOTAL A/P").font=Font(bold=True,color=WHITE); ws.cell(row=r,column=1).fill=fill(NAVY)
for i,b in enumerate(APB):
    cc=ws.cell(row=r,column=2+i,value=sum(vmap[c][b] for c in vmap)); cc.number_format='$#,##0'; cc.font=Font(bold=True,color=WHITE); cc.fill=fill(NAVY)
tc=ws.cell(row=r,column=7,value=ap_total); tc.number_format='$#,##0'; tc.font=Font(bold=True,color=WHITE); tc.fill=fill(NAVY)
ws.column_dimensions["A"].width=42
for col in "BCDEFG": ws.column_dimensions[col].width=14
ws.freeze_panes="A5"

# ===========================================================================
# 8. Cash & Liquidity
# ===========================================================================
ws=sheet("Cash & Liquidity",GREEN)
title_block(ws,"Cash & Liquidity — Covenant View",
            f"QuickBooks cash + LOC  •  covenant inputs are USER-MAINTAINED (see yellow)  •  as of {AS_OF}")
def kv(ws,r,label,val,fmt='$#,##0',note="",userinput=False,statuscolor=None):
    ws.cell(row=r,column=1,value=label).font=Font(bold=True,color=NAVY)
    c=ws.cell(row=r,column=2,value=val); c.number_format=fmt; c.font=Font(bold=True,size=12,color=NAVY)
    if userinput: c.fill=fill("FFF3CD")
    if statuscolor: c.font=Font(bold=True,size=12,color=statuscolor)
    ws.cell(row=r,column=3,value=note).font=Font(size=9,italic=True,color=GREY)
    for ci in (1,2): ws.cell(row=r,column=ci).border=border
r=5
kv(ws,r,"Cash Balance",cash_bal,note="QuickBooks balance sheet",statuscolor=RED if cash_bal<0 else GREEN); r+=1
kv(ws,r,"Operating Cash Flow (YTD)",f(cash["OperatingCF"]),note="QB cash flow statement"); r+=1
kv(ws,r,"Investing Cash Flow (YTD)",f(cash["InvestingCF"])); r+=1
kv(ws,r,"Financing Cash Flow (YTD)",f(cash["FinancingCF"])); r+=1
kv(ws,r,"Net Cash Change (YTD)",f(cash["NetCashChange"])); r+=2
kv(ws,r,"LOC Drawn",loc_drawn,note="QB — Forum Line of Credit (0874)"); r+=1
kv(ws,r,"LOC Limit",loc_limit,note="USER INPUT — set your Forum commitment",userinput=True); r+=1
kv(ws,r,"LOC Utilization",loc_util,fmt='0.0%',note="drawn / limit",
   statuscolor=RED if loc_util>=0.9 else (AMBER if loc_util>=0.75 else GREEN)); r+=1
kv(ws,r,"Advance Rate",adv,fmt='0.0%',note="USER INPUT — borrowing-base advance rate",userinput=True); r+=1
kv(ws,r,"Eligible A/R",elig,note="USER INPUT — eligible borrowing base (default = trade A/R)",userinput=True); r+=1
kv(ws,r,"BBC Availability (headroom)",bbc,note="min(EligibleAR×Advance, Limit) − Drawn",
   statuscolor=RED if bbc<0 else GREEN); r+=1
status="Critical" if loc_util>=0.9 else ("Watch" if loc_util>=0.75 else "Healthy")
kv(ws,r,"Liquidity Status",status,fmt='General',
   statuscolor=RED if status=="Critical" else (AMBER if status=="Watch" else GREEN)); r+=1
ws.column_dimensions["A"].width=30; ws.column_dimensions["B"].width=18; ws.column_dimensions["C"].width=48

# ===========================================================================
# 9. Balance Sheet
# ===========================================================================
ws=sheet("Balance Sheet",NAVY2)
title_block(ws,"Balance Sheet",f"QuickBooks, as of {AS_OF}")
hdr(ws,4,["Account","Section","Amount"])
r=5
for sec in ["Assets","Liabilities","Equity"]:
    secrows=[x for x in bsheet if x["Section"]==sec]
    for x in secrows:
        ws.cell(row=r,column=1,value=x["Account"]).border=border
        ws.cell(row=r,column=2,value=sec).border=border
        cc=ws.cell(row=r,column=3,value=f(x["Amount"])); cc.number_format='$#,##0'; cc.border=border
        r+=1
    tot=sum(f(x["Amount"]) for x in secrows)
    ws.cell(row=r,column=1,value=f"TOTAL {sec.upper()}").font=Font(bold=True,color=WHITE); ws.cell(row=r,column=1).fill=fill(NAVY)
    ws.cell(row=r,column=2).fill=fill(NAVY)
    cc=ws.cell(row=r,column=3,value=tot); cc.number_format='$#,##0'; cc.font=Font(bold=True,color=WHITE); cc.fill=fill(NAVY)
    r+=2
ws.column_dimensions["A"].width=36; ws.column_dimensions["B"].width=14; ws.column_dimensions["C"].width=18

# ===========================================================================
# 10. Data Health
# ===========================================================================
ws=sheet("Data Health",AMBER)
title_block(ws,"Data Health & Refresh","Trust panel — surfaces data-hygiene issues that would distort the numbers")
checks=[
    ("Last data refresh (as-of)",AS_OF,""),
    ("Active jobs (Knowify)",len(wip),f"JobsReport Total = {recon.get('qb_jobs_total','')}"),
    ("Managed jobs (PM + budget + ≥$1k)",len(managed),""),
    ("Active jobs missing a PM",len(no_pm),"assign in Knowify"),
    ("Active jobs missing a budget",len(no_budget),"load budget in Knowify"),
    ("GL $ in UNALLOCATED division",f"${unalloc:,.0f}","fix QuickBooks Class tagging"),
    ("YTD2026 Revenue ties to QB",f"${y['rev']:,.0f}",f"QB P&L {recon.get('qb_pl_income',0):,.2f}"),
    ("YTD2026 Net Income ties to QB",f"${y['ni']:,.0f}",f"QB cash flow {recon.get('qb_cf_netincome',0):,.2f}"),
    ("Trade A/R ties to balance sheet",f"${ar_total:,.0f}",f"QB BS A/R {recon['ar_balance_sheet']:,.0f}"),
    ("A/P ties to balance sheet",f"${ap_total:,.0f}",f"QB BS A/P {recon['ap_balance_sheet']:,.0f}"),
    ("Total assets (QB)",f"${recon['total_assets']:,.0f}",""),
]
hdr(ws,4,["Check","Value","Note"])
r=5
for k,v,n in checks:
    ws.cell(row=r,column=1,value=k).border=border
    ws.cell(row=r,column=2,value=v).border=border; ws.cell(row=r,column=2).font=Font(bold=True,color=NAVY)
    ws.cell(row=r,column=3,value=n).border=border; ws.cell(row=r,column=3).font=Font(italic=True,color=GREY)
    r+=1
ws.column_dimensions["A"].width=36; ws.column_dimensions["B"].width=20; ws.column_dimensions["C"].width=34

# ===========================================================================
# Raw data tables (for pivoting / play) + as real Excel Tables
# ===========================================================================
def raw_sheet(name, csvfile):
    rows=rd(csvfile);
    if not rows: return
    ws=sheet("» "+name,GREY)
    headers=list(rows[0].keys())
    for ci,h in enumerate(headers):
        c=ws.cell(row=1,column=ci+1,value=h); c.font=Font(bold=True,color=WHITE); c.fill=fill(NAVY2)
    numeric=set()
    for h in headers:
        try:
            float(rows[0][h]);
            if h not in ("ProjectId","YearMonth","Date","AsOfDate","SnapshotDate","Period","PeriodEnd","MonthEnd"):
                numeric.add(h)
        except (TypeError,ValueError): pass
    for ri,row in enumerate(rows,start=2):
        for ci,h in enumerate(headers):
            v=row[h]
            if h in numeric:
                try: v=float(v)
                except (TypeError,ValueError): pass
            ws.cell(row=ri,column=ci+1,value=v)
    ref=f"A1:{get_column_letter(len(headers))}{len(rows)+1}"
    safe=name.replace(" ","_").replace("&","").replace("-","_")
    tbl=Table(displayName=f"tbl_{safe}",ref=ref)
    tbl.tableStyleInfo=TableStyleInfo(name="TableStyleMedium2",showRowStripes=True)
    ws.add_table(tbl)
    for ci,h in enumerate(headers):
        ws.column_dimensions[get_column_letter(ci+1)].width=max(11,min(36,len(h)+3))

for nm,cf in [("Fact_GL","Fact_GL.csv"),("Fact_WIP","Fact_WIP.csv"),("Fact_PL_Monthly","Fact_PL_Monthly.csv"),
              ("Fact_AR","Fact_AR.csv"),("Fact_AP","Fact_AP.csv"),("Fact_Cash","Fact_Cash.csv"),
              ("Fact_Budget","Fact_Budget.csv"),("Fact_BalanceSheet","Fact_BalanceSheet.csv"),
              ("Dim_Job","Dim_Job.csv"),("Dim_Account","Dim_Account.csv"),("Dim_Division","Dim_Division.csv"),
              ("Dim_PM","Dim_PM.csv"),("Param_Cash","Param_Cash.csv")]:
    raw_sheet(nm,cf)

# ===========================================================================
# Job Revenue by Month 2026 (present only if the invoice pull produced the CSV)
# ===========================================================================
_jrev = os.path.join(DATA, "Job_Revenue_2026_byMonth.csv")
if os.path.exists(_jrev):
    from openpyxl.formatting.rule import DataBarRule
    jr = list(csv.reader(open(_jrev)))
    jhdr, jbody, jtot = jr[0], jr[1:-1], jr[-1]
    ws = sheet("Job Revenue 2026", NAVY)
    title_block(ws, "Revenue Billed by Job — 2026 (Jan–May)",
                f"Knowify invoices by invoice date  •  {len(jbody)} jobs with 2026 revenue  •  sorted largest first")
    hdr(ws, 4, jhdr)
    r = 5
    for row in jbody:
        ws.cell(row=r, column=1, value=row[0]).border = border
        for i in range(1, 7):
            cell = ws.cell(row=r, column=i+1, value=float(row[i])); cell.number_format = '$#,##0'; cell.border = border
            if i == 6: cell.font = Font(bold=True)
        r += 1
    ws.cell(row=r, column=1, value="TOTAL — all jobs").font = Font(bold=True, color=WHITE)
    ws.cell(row=r, column=1).fill = fill(NAVY)
    for i in range(1, 7):
        cell = ws.cell(row=r, column=i+1, value=float(jtot[i])); cell.number_format = '$#,##0'
        cell.font = Font(bold=True, color=WHITE); cell.fill = fill(NAVY); cell.border = border
    ws.column_dimensions["A"].width = 54
    for col in "BCDEFG": ws.column_dimensions[col].width = 14
    ws.freeze_panes = "B5"
    ws.conditional_formatting.add(f"G5:G{r-1}", DataBarRule(start_type="min", end_type="max", color=TEAL))

# ---- Dark-theme pass: paint presentation sheets, flip dark text to light, de-junk charts ----
PRES={"Command Center","P&L","Division Performance","Project Tracker","WIP & Profit Fade",
      "AR Aging","AP Aging","Cash & Liquidity","Balance Sheet","Data Health","Job Revenue 2026"}
KEEP={c.upper() for c in (ACCENT,NEUTRAL,GOOD,BAD,WARN,SUBINK,INK,WHITE,"4F8FC7","515967","3A4150")}
def _rgb6(color):
    rgb=getattr(color,"rgb",None)
    return rgb[-6:].upper() if isinstance(rgb,str) else None
for _ws in wb.worksheets:
    if _ws.title not in PRES:
        continue
    maxr=_ws.max_row; maxc=max(_ws.max_column,14)
    for rr in range(1,maxr+4):
        for cc in range(1,maxc+2):
            cell=_ws.cell(row=rr,column=cc)
            if cell.fill is None or cell.fill.patternType is None:   # paint empty cells with the base
                cell.fill=fill(BASE)
            if _rgb6(cell.font.color) not in KEEP:                   # flip black/dark text to white
                f0=cell.font
                cell.font=Font(name=f0.name,size=f0.size,bold=f0.bold,italic=f0.italic,color=INK,underline=f0.underline)
    for ch in getattr(_ws,"_charts",[]):                            # remove chart junk + recolor on-palette
        is_line=ch.__class__.__name__.startswith("Line")
        pal=[ACCENT,NEUTRAL,GOOD,"4F8FC7"]
        for i,s in enumerate(ch.series):
            gp=GraphicalProperties()
            col=pal[i%len(pal)]
            if is_line: gp.line=LineProperties(solidFill=col,w=26000)
            else: gp.solidFill=col
            s.graphicalProperties=gp
        try:
            from openpyxl.chart.text import RichText
            from openpyxl.drawing.text import (Paragraph, ParagraphProperties,
                                               CharacterProperties)
            _lt=lambda: RichText(p=[Paragraph(pPr=ParagraphProperties(
                defRPr=CharacterProperties(solidFill=SUBINK)), endParaRPr=CharacterProperties(solidFill=SUBINK))])
            ch.graphical_properties=GraphicalProperties(solidFill=BASE)        # chart area = base
            ch.plot_area.graphicalProperties=GraphicalProperties(solidFill=CARD)  # plot = card
            for ax in (ch.x_axis, ch.y_axis):
                ax.majorGridlines=None
                ax.txPr=_lt()
                ax.spPr=GraphicalProperties(ln=LineProperties(solidFill=RULE))
            if ch.title is not None:
                try: ch.title.tx.rich.p[0].pPr=ParagraphProperties(defRPr=CharacterProperties(solidFill=INK,b=True))
                except Exception: pass
        except Exception:
            try: ch.y_axis.majorGridlines=None
            except Exception: pass

# ---- font pass: normalize every populated cell to the DS typeface ----
for _ws in wb.worksheets:
    for _row in _ws.iter_rows():
        for _c in _row:
            if _c.value is None and _c.fill.fgColor.rgb in (None, "00000000"):
                continue
            f0=_c.font
            _c.font=Font(name=FONT, size=f0.size, bold=f0.bold, italic=f0.italic,
                         color=f0.color, underline=f0.underline)

wb.save(OUT)
print("Saved", OUT)
print(f"Sheets: {len(wb.sheetnames)} -> {wb.sheetnames}")
