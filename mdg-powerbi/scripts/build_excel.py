#!/usr/bin/env python3
"""
Build MDG_Executive_Dashboard.xlsx — clean, professional, FORMULA-DRIVEN, 5 sheets.

Sheets (max 5):
  1. Dashboard               KPI cards + data-source panel + by-division + chart
  2. Financials              P&L (3 periods) + Cash & Liquidity + Balance Sheet
  3. Operations              Projects (by PM) + A/R aging + A/P aging
  4. Job Revenue by Month    per-job 2026 monthly billings
  5. Data                    all source tables (Excel Tables) that the formulas hit

Every number on sheets 1-4 is a live Excel formula (SUMIFS/COUNTIFS/structured
refs) against the Data tables. Each block states its source (QuickBooks vs Knowify).
Reads the star-schema CSVs in data/ (+ the 2026 invoice pulls in build/raw/).
"""
import csv, os, json, glob, datetime as dt
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.table import Table, TableStyleInfo
from openpyxl.chart import LineChart, Reference
from openpyxl.chart.shapes import GraphicalProperties
from openpyxl.drawing.line import LineProperties

HERE=os.path.dirname(os.path.abspath(__file__)); ROOT=os.path.dirname(HERE)
DATA=os.path.join(ROOT,"data"); RAW=os.path.join(ROOT,"build","raw")
OUT=os.path.join(ROOT,"output","MDG_Executive_Dashboard.xlsx")
os.makedirs(os.path.dirname(OUT),exist_ok=True)

def rdrows(name):
    with open(os.path.join(DATA,name),encoding="utf-8") as fh:
        r=list(csv.reader(fh)); return r[0],r[1:]
def rddict(name):
    with open(os.path.join(DATA,name),encoding="utf-8") as fh:
        return list(csv.DictReader(fh))
def n(x):
    try: return float(x)
    except (TypeError,ValueError): return 0.0
def isnum(v):
    try: float(v); return True
    except (TypeError,ValueError): return False

recon=json.load(open(os.path.join(DATA,"_reconciliation.json"))); AS_OF=recon["as_of"]
QB,KN="QuickBooks Online","Knowify"
wip=rddict("Fact_WIP.csv"); bs=rddict("Fact_BalanceSheet.csv"); divs=rddict("Dim_Division.csv")
arr=rddict("Fact_AR.csv"); cashrow=rddict("Fact_Cash.csv")[0]
inv=[]
for p in sorted(glob.glob(os.path.join(RAW,"invoices_2026_p*.json"))):
    for r in json.load(open(p))["Data"]:
        inv.append([r["ProjectName"].strip(), r["InvoiceDate"][:7], round(float(r["TotalAmount"]),2)])
cash_bal=n(cashrow["CashBalance"]); loc_drawn=n(cashrow["LOCDrawn"]); loc_limit=n(cashrow["LOCLimit"])
loc_util=loc_drawn/loc_limit if loc_limit else 0
elig=n(cashrow["EligibleAR"]); adv=n(cashrow["AdvanceRate"]); bbc=min(elig*adv,loc_limit)-loc_drawn
n_fading=sum(1 for r in wip if r["Managed"]=="TRUE" and n(r["ProfitFadePct"])<-0.02)

# ---- clean professional light palette ----
FONT="Segoe UI"
INK="1F2937"; SUBINK="6B7280"; FAINT="9AA3AF"
ACCENT="1F4E79"; ACCENT2="2E75B6"; RULE="D7DCE3"; PANEL="F3F6F9"; CARDBD="C9D2DD"
GOOD="2E7D32"; BAD="C0392B"; WARN="B7791F"; WHITE="FFFFFF"
def fill(c): return PatternFill("solid",fgColor=c)
def put(ws,r,c,v,sz=10,bold=False,color=INK,fmt=None,align="left",fillc=None,italic=False,indent=0):
    cell=ws.cell(row=r,column=c,value=v)
    cell.font=Font(name=FONT,size=sz,bold=bold,color=color,italic=italic)
    cell.alignment=Alignment(horizontal=align,vertical="center",indent=indent)
    if fmt: cell.number_format=fmt
    if fillc: cell.fill=fill(fillc)
    return cell
def boxrange(ws,r1,c1,r2,c2,color=CARDBD):
    s=Side(style="thin",color=color)
    for r in range(r1,r2+1):
        for c in range(c1,c2+1):
            ws.cell(row=r,column=c).border=Border(left=s if c==c1 else None,right=s if c==c2 else None,
                                                  top=s if r==r1 else None,bottom=s if r==r2 else None)
def title_block(ws,title,sub,source):
    put(ws,1,1,title,18,True,INK,indent=1); ws.merge_cells("A1:N1"); ws.row_dimensions[1].height=30
    put(ws,2,1,sub,10,False,SUBINK,indent=1); ws.merge_cells("A2:N2"); ws.row_dimensions[2].height=16
    for c in range(1,15): ws.cell(row=2,column=c).border=Border(bottom=Side(style="medium",color=ACCENT))
    put(ws,3,1,"Source: "+source,9,False,ACCENT2,italic=True,indent=1); ws.merge_cells("A3:N3"); ws.row_dimensions[3].height=15
def section(ws,row,text,source=None):
    put(ws,row,1,text,12,True,ACCENT); ws.row_dimensions[row].height=20
    if source: put(ws,row,6,"Source: "+source,9,False,FAINT,italic=True)
def thead(ws,row,cols,widths=None,start=1):
    for i,h in enumerate(cols):
        cell=put(ws,row,start+i,h,10,True,WHITE,fillc=ACCENT)
        cell.alignment=Alignment(horizontal=("left" if i==0 else "center"),vertical="center",wrap_text=True,indent=(1 if i==0 else 0))
    ws.row_dimensions[row].height=22
    if widths:
        for i,w in enumerate(widths): ws.column_dimensions[get_column_letter(start+i)].width=w
def line(ws,row,label,vals,fmt,bold=False,total=False,ncols=None,indent=1):
    put(ws,row,1,label,10,bold,INK,indent=indent,fillc=(PANEL if total else None))
    for i,v in enumerate(vals):
        put(ws,row,2+i,v,10,bold,INK,fmt=fmt,align="right",fillc=(PANEL if total else None))
    span=(ncols or len(vals)+1)
    for c in range(1,span+1):
        ws.cell(row=row,column=c).border=Border(bottom=Side(style="thin",color=(ACCENT if total else RULE)))

wb=Workbook(); wb.remove(wb.active)
def sumif_gl(p,c): return f'SUMIFS(tGL[Amount],tGL[Period],"{p}",tGL[Category],"{c}")'

DATASHEET="Data"
# monthly 2026 row positions on the Data sheet are resolved after the Data sheet is built
MONTH_REF={}

# =====================================================================
# 5) DATA  (built first so report formulas/chart can point at it)
# =====================================================================
dws=wb.create_sheet(DATASHEET); dws.sheet_properties.tabColor=FAINT; dws.sheet_view.showGridLines=False
put(dws,1,1,"DATA — source tables. Edit here (or re-run the refresh) and the report sheets recalc. Each table is labeled with its source.",10,True,INK)
drow=3
def data_table(tablename,csvfile,source,money_cols=(),pct_cols=(),id_cols=(),rows=None,headers=None):
    global drow
    if rows is None: headers,rows=rdrows(csvfile)
    put(dws,drow,1,f"{tablename}   —   {source}   —   as of {AS_OF}",9,True,SUBINK)
    hr=drow+1
    for j,h in enumerate(headers,1):
        c=put(dws,hr,j,h,9,True,WHITE,fillc=ACCENT2); c.alignment=Alignment(horizontal="center",vertical="center",wrap_text=True)
    for i,row in enumerate(rows,hr+1):
        for j,v in enumerate(row,1):
            h=headers[j-1]
            val=v if h in id_cols else (n(v) if (h in money_cols or h in pct_cols or isnum(v)) else v)
            cell=put(dws,i,j,val,9,False,INK,align=("right" if (h in money_cols or h in pct_cols) else "left"))
            if h in money_cols: cell.number_format='#,##0'
            elif h in pct_cols: cell.number_format='0.0%'
    last=get_column_letter(len(headers)); end=hr+len(rows)
    t=Table(displayName=tablename,ref=f"A{hr}:{last}{end}")
    t.tableStyleInfo=TableStyleInfo(name="TableStyleLight9",showRowStripes=True)
    dws.add_table(t)
    info=(hr,hr+1,end)   # header row, first data row, last row
    drow=end+2
    return info

data_table("tGL","Fact_GL.csv",f"{QB} — Profit & Loss",money_cols={"Amount"},
           id_cols={"Account","Period","PeriodEnd","DivKey","Category"})
mi=data_table("tMonthly","Fact_PL_Monthly.csv",f"{QB} — monthly P&L",
           money_cols={"Revenue","COGS","GrossProfit","OpEx","NetIncome"},pct_cols={"GrossMarginPct","NetMarginPct"},id_cols={"MonthEnd"})
data_table("tWIP","Fact_WIP.csv",f"{KN} — Jobs / AJR",
           money_cols={"ContractTotal","ChangeOrders","Invoiced","PaymentsInvoices","BudgetTotal","ActualCost","EarnedRevenue","WIPNet","KnowifyWIP","Overbilled","Underbilled","ProfitAmount","ProjectedProfit","Retainage","OpenAR"},
           pct_cols={"PctComplete","ProfitPct","ProjectedProfitPct","EstMarginPct","ProfitFadePct"},
           id_cols={"SnapshotDate","ProjectId","Job","DivKey","PMName","Customer","Status","HasBudget","Managed"})
data_table("tAR","Fact_AR.csv",f"{QB} — A/R aging",money_cols={"Amount"},id_cols={"Customer","Bucket","IsRetainage","AsOfDate"})
data_table("tAP","Fact_AP.csv",f"{QB} — A/P aging",money_cols={"Amount"},id_cols={"Vendor","Bucket","AsOfDate"})
data_table("tCash","Fact_Cash.csv",f"{QB} — balance sheet & cash flow",
           money_cols={"CashBalance","LOCDrawn","LOCCapX","OperatingCF","InvestingCF","FinancingCF","NetCashChange","LOCLimit","EligibleAR","CurrentAssets","CurrentLiabilities"},pct_cols={"AdvanceRate"},id_cols={"Date"})
data_table("tBS","Fact_BalanceSheet.csv",f"{QB} — balance sheet",money_cols={"Amount"},id_cols={"Account","Section","AsOfDate"})
inv_headers=["Job","Month","Amount"]
data_table("tInv",None,f"{KN} — Invoices (by invoice date)",money_cols={"Amount"},id_cols={"Job","Month"},rows=inv,headers=inv_headers)
dws.column_dimensions["A"].width=44
for col in range(2,30): dws.column_dimensions[get_column_letter(col)].width=12
# resolve 2026 monthly rows for chart + forecast (tMonthly header row mi[0], data from mi[1])
mhdr,mrows=rdrows("Fact_PL_Monthly.csv")
m26=[k for k,r in enumerate(mrows) if r[0][:4]=="2026" and r[0]<="2026-05-31"]
MR1=mi[1]+min(m26); MR2=mi[1]+max(m26); MN=len(m26)

# ---- CFO formula library (all pure formulas over the Data tables) ----
DAYS=(dt.date.fromisoformat(AS_OF)-dt.date(int(AS_OF[:4]),1,1)).days+1
F={'rev':sumif_gl("YTD2026","Revenue"),'cogs':sumif_gl("YTD2026","COGS"),
   'opex':sumif_gl("YTD2026","Operating Expense"),'oi':sumif_gl("YTD2026","Other Income"),
   'oe':sumif_gl("YTD2026","Other Expense"),
   'dep':'SUMIFS(tGL[Amount],tGL[Account],"Depreciation",tGL[Period],"YTD2026")',
   'int':'SUMIFS(tGL[Amount],tGL[Account],"Interest Paid",tGL[Period],"YTD2026")',
   'assets':'SUMIFS(tBS[Amount],tBS[Section],"Assets")','liab':'SUMIFS(tBS[Amount],tBS[Section],"Liabilities")',
   'eq':'SUMIFS(tBS[Amount],tBS[Section],"Equity")','invb':'SUMIFS(tBS[Amount],tBS[Account],"Drywall Inventory")',
   'cash':'SUM(tCash[CashBalance])','ar':'SUMIFS(tAR[Amount],tAR[IsRetainage],"FALSE")',
   'arcur':'SUMIFS(tAR[Amount],tAR[Bucket],"Current",tAR[IsRetainage],"FALSE")',
   'retain':'SUMIFS(tAR[Amount],tAR[IsRetainage],"TRUE")','ap':'SUM(tAP[Amount])',
   'locd':'SUM(tCash[LOCDrawn])','locl':'SUM(tCash[LOCLimit])',
   'backlog':'(SUM(tWIP[ContractTotal])-SUM(tWIP[Invoiced]))',
   'fy25':sumif_gl("FY2025","Revenue"),'fy24':sumif_gl("FY2024","Revenue"),
   'fcrev':f"SUM('{DATASHEET}'!B{MR1}:B{MR2})/{MN}*12"}
F['nop']=f'({F["rev"]}-{F["cogs"]}-{F["opex"]})'
F['ni']=f'({F["rev"]}-{F["cogs"]}-{F["opex"]}+{F["oi"]}-{F["oe"]})'
F['ebitda']=f'({F["nop"]}+{F["dep"]}+{F["int"]})'
# Current assets / current liabilities taken straight from QuickBooks' own
# classification (Fact_Cash) so the liquidity ratios match QB exactly.
F['ca']='SUM(tCash[CurrentAssets])'
F['cl']='SUM(tCash[CurrentLiabilities])'
RATIOS=[
 ("Profitability","Gross margin %",f'=IFERROR(({F["rev"]}-{F["cogs"]})/{F["rev"]},0)','0.0%'),
 ("Profitability","Operating margin %",f'=IFERROR({F["nop"]}/{F["rev"]},0)','0.0%'),
 ("Profitability","Net margin %",f'=IFERROR({F["ni"]}/{F["rev"]},0)','0.0%'),
 ("Profitability","EBITDA",f'={F["ebitda"]}','$#,##0'),
 ("Profitability","EBITDA margin %",f'=IFERROR({F["ebitda"]}/{F["rev"]},0)','0.0%'),
 ("Returns","Return on equity",f'=IFERROR({F["ni"]}/{F["eq"]},0)','0.0%'),
 ("Returns","Return on assets",f'=IFERROR({F["ni"]}/{F["assets"]},0)','0.0%'),
 ("Liquidity","Current ratio",f'=IFERROR({F["ca"]}/{F["cl"]},0)','0.00'),
 ("Liquidity","Quick ratio",f'=IFERROR(({F["ca"]}-{F["invb"]})/{F["cl"]},0)','0.00'),
 ("Liquidity","Working capital",f'={F["ca"]}-{F["cl"]}','$#,##0'),
 ("Liquidity","Days cash on hand",f'=IFERROR({F["cash"]}/(({F["cogs"]}+{F["opex"]})/{DAYS}),0)','0.0'),
 ("Leverage","Debt-to-equity",f'=IFERROR({F["liab"]}/{F["eq"]},0)','0.00'),
 ("Leverage","LOC utilization",f'=IFERROR({F["locd"]}/{F["locl"]},0)','0.0%'),
 ("Leverage","Net debt (LOC - cash)",f'={F["locd"]}-{F["cash"]}','$#,##0'),
 ("Efficiency — cash cycle","DSO — days sales outstanding",f'=IFERROR({F["ar"]}/{F["rev"]}*{DAYS},0)','0.0'),
 ("Efficiency — cash cycle","DPO — days payable outstanding",f'=IFERROR({F["ap"]}/{F["cogs"]}*{DAYS},0)','0.0'),
 ("Efficiency — cash cycle","DIO — days inventory outstanding",f'=IFERROR({F["invb"]}/{F["cogs"]}*{DAYS},0)','0.0'),
 ("Efficiency — cash cycle","Cash conversion cycle (days)",f'=IFERROR({F["ar"]}/{F["rev"]}*{DAYS}+{F["invb"]}/{F["cogs"]}*{DAYS}-{F["ap"]}/{F["cogs"]}*{DAYS},0)','0.0'),
 ("Growth","Revenue YoY (FY25 vs FY24)",f'=IFERROR(({F["fy25"]}-{F["fy24"]})/{F["fy24"]},0)','0.0%'),
 ("Growth","2026 forecast vs FY2025",f'=IFERROR(({F["fcrev"]}-{F["fy25"]})/{F["fy25"]},0)','0.0%'),
 ("Backlog & receivables","Backlog (unbilled contract)",f'={F["backlog"]}','$#,##0'),
 ("Backlog & receivables","Months of backlog",f'=IFERROR({F["backlog"]}/({F["fcrev"]}/12),0)','0.0'),
 ("Backlog & receivables","A/R overdue %",f'=IFERROR(({F["ar"]}-{F["arcur"]})/{F["ar"]},0)','0.0%'),
 ("Backlog & receivables","Retainage % of A/R",f'=IFERROR({F["retain"]}/({F["ar"]}+{F["retain"]}),0)','0.0%'),
 ("Backlog & receivables","Collected % (billed -> paid)",'=IFERROR(SUM(tWIP[PaymentsInvoices])/SUM(tWIP[Invoiced]),0)','0.0%'),
]
def ratio_block(ws,R):
    section(ws,R,"Key ratios & metrics (CFO)","formulas over the Data sheet"); R+=1
    thead(ws,R,["Metric","Value"],widths=[40,18]); R+=1
    grp=None
    for g,label,fml,fmt in RATIOS:
        if g!=grp:
            put(ws,R,1,g,9,True,ACCENT2,indent=1,fillc=PANEL); put(ws,R,2,"",fillc=PANEL); grp=g; R+=1
        put(ws,R,1,label,10,False,INK,indent=2)
        put(ws,R,2,fml,10,False,INK,fmt=fmt,align="right")
        for c in (1,2): ws.cell(row=R,column=c).border=Border(bottom=Side(style="thin",color=RULE))
        R+=1
    return R
# concentration lists (Python ranks; values are formulas)
custAR={}
for r in arr:
    if r["IsRetainage"]=="FALSE": custAR[r["Customer"]]=custAR.get(r["Customer"],0)+n(r["Amount"])
TOPCUST=[c for c in sorted(custAR,key=lambda x:-custAR[x])[:10]]
jobBL={w["Job"]:(n(w["ContractTotal"])-n(w["Invoiced"])) for w in wip}
TOPJOB=[j for j in sorted(jobBL,key=lambda x:-jobBL[x])[:10]]

# =====================================================================
# 1) DASHBOARD
# =====================================================================
d=wb.create_sheet("Dashboard",0); d.sheet_properties.tabColor=ACCENT; d.sheet_view.showGridLines=False
title_block(d,"Midwest Design Group — Executive Dashboard",
            f"Formula-driven workbook  •  live data  •  as of {AS_OF}","QuickBooks Online + Knowify (see Data sheet)")
section(d,5,"Data sources")
for r,txt in [(6,f"QuickBooks Online   —   Profit & Loss · Balance Sheet · A/R & A/P Aging · Cash Flow            as of {AS_OF}"),
              (7,f"Knowify   —   Jobs / AJR & Invoices                                                            as of {AS_OF}"),
              (8,"Every figure on the report sheets is a live Excel formula off the Data sheet and reconciles to source (RECONCILIATION.md).")]:
    put(d,r,1,txt,9,False,INK,indent=1)
    for c in range(1,15): d.cell(row=r,column=c).fill=fill(PANEL)
    d.merge_cells(start_row=r,start_column=1,end_row=r,end_column=14)
boxrange(d,6,1,8,14)
def card(ws,r0,col,label,formula,fmt,context,vcolor=INK):
    for dr in range(4):
        for dc in (0,1): ws.cell(row=r0+dr,column=col+dc).fill=fill(WHITE)
    put(ws,r0,col,label.upper(),8,True,SUBINK,indent=1); ws.merge_cells(start_row=r0,start_column=col,end_row=r0,end_column=col+1)
    put(ws,r0+1,col,formula,18,True,vcolor,fmt=fmt,indent=1); ws.merge_cells(start_row=r0+1,start_column=col,end_row=r0+2,end_column=col+1)
    put(ws,r0+3,col,context,8,False,SUBINK,indent=1); ws.merge_cells(start_row=r0+3,start_column=col,end_row=r0+3,end_column=col+1)
    boxrange(ws,r0,col,r0+3,col+1)
section(d,10,"Key metrics","live formulas")
gm=f'=IFERROR(({sumif_gl("YTD2026","Revenue")}-{sumif_gl("YTD2026","COGS")})/{sumif_gl("YTD2026","Revenue")},0)'
ni=(f'={sumif_gl("YTD2026","Revenue")}-{sumif_gl("YTD2026","COGS")}-{sumif_gl("YTD2026","Operating Expense")}'
    f'+{sumif_gl("YTD2026","Other Income")}-{sumif_gl("YTD2026","Other Expense")}')
card(d,11,1,"YTD Revenue",f'={sumif_gl("YTD2026","Revenue")}','$#,##0',"QuickBooks · P&L")
card(d,11,3,"Gross Margin",gm,'0.0%',"QuickBooks · P&L")
card(d,11,5,"Net Income",ni,'$#,##0',"QuickBooks · P&L")
card(d,11,7,"Cash","=SUM(tCash[CashBalance])",'$#,##0',"QuickBooks · balance sheet",BAD if cash_bal<0 else GOOD)
card(d,11,9,"Trade A/R",'=SUMIFS(tAR[Amount],tAR[IsRetainage],"FALSE")','$#,##0',"QuickBooks · A/R aging")
card(d,11,11,"Backlog","=SUM(tWIP[ContractTotal])-SUM(tWIP[Invoiced])",'$#,##0',"Knowify · jobs")
card(d,16,1,"2026 Forecast Rev",f"=SUM('{DATASHEET}'!B{MR1}:B{MR2})/{MN}*12",'$#,##0',f"run-rate · {MN} mo")
card(d,16,3,"Managed Jobs",'=COUNTIF(tWIP[Managed],"TRUE")','#,##0',"Knowify · PM + budget")
card(d,16,5,"Jobs Fading",'=COUNTIFS(tWIP[Managed],"TRUE",tWIP[ProfitFadePct],"<-0.02")','#,##0',"forecast margin < booked",BAD if n_fading else GOOD)
card(d,16,7,"LOC Utilization","=IFERROR(SUM(tCash[LOCDrawn])/SUM(tCash[LOCLimit]),0)",'0.0%',"QuickBooks + input",BAD if loc_util>=0.9 else (WARN if loc_util>=0.75 else GOOD))
card(d,16,9,"Overbilled","=SUM(tWIP[Overbilled])",'$#,##0',"Knowify · billed ahead")
card(d,16,11,"BBC Headroom","=MIN(SUM(tCash[EligibleAR])*AVERAGE(tCash[AdvanceRate]),SUM(tCash[LOCLimit]))-SUM(tCash[LOCDrawn])",'$#,##0',"borrowing-base avail",BAD if bbc<0 else GOOD)
section(d,21,"CFO scorecard","live formulas")
card(d,22,1,"EBITDA",f'={F["ebitda"]}','$#,##0',"QuickBooks · P&L")
card(d,22,3,"Operating Margin",f'=IFERROR({F["nop"]}/{F["rev"]},0)','0.0%',"QuickBooks · P&L")
card(d,22,5,"Current Ratio",f'=IFERROR({F["ca"]}/{F["cl"]},0)','0.00',"QuickBooks · balance sheet")
card(d,22,7,"Debt / Equity",f'=IFERROR({F["liab"]}/{F["eq"]},0)','0.00',"QuickBooks · balance sheet")
card(d,22,9,"DSO (days)",f'=IFERROR({F["ar"]}/{F["rev"]}*{DAYS},0)','0.0',"A/R vs revenue")
card(d,22,11,"Cash Conv. Cycle",f'=IFERROR({F["ar"]}/{F["rev"]}*{DAYS}+{F["invb"]}/{F["cogs"]}*{DAYS}-{F["ap"]}/{F["cogs"]}*{DAYS},0)','0.0',"DSO + DIO - DPO")
for col in range(1,13): d.column_dimensions[get_column_letter(col)].width=11.5
section(d,28,"By division","Knowify · jobs")
thead(d,29,["Division","Contract","Invoiced","Profit $","Margin"],widths=[22,14,14,14,10],start=9)
present=[r for r in divs if any(w["DivKey"]==r["DivKey"] for w in wip)]; rr=30
for dv in present:
    k=dv["DivKey"]
    put(d,rr,9,dv["Division"],10,False,INK,indent=1)
    put(d,rr,10,f'=SUMIF(tWIP[DivKey],"{k}",tWIP[ContractTotal])',10,False,INK,fmt='#,##0',align="right")
    put(d,rr,11,f'=SUMIF(tWIP[DivKey],"{k}",tWIP[Invoiced])',10,False,INK,fmt='#,##0',align="right")
    put(d,rr,12,f'=SUMIF(tWIP[DivKey],"{k}",tWIP[ProfitAmount])',10,False,INK,fmt='#,##0',align="right")
    put(d,rr,13,f'=IFERROR(SUMIF(tWIP[DivKey],"{k}",tWIP[ProfitAmount])/SUMIF(tWIP[DivKey],"{k}",tWIP[ContractTotal]),0)',10,False,INK,fmt='0.0%',align="right")
    for c in range(9,14): d.cell(row=rr,column=c).border=Border(bottom=Side(style="thin",color=RULE))
    rr+=1
put(d,28,1,"Revenue by month (2026)",11,True,ACCENT)
ch=LineChart(); ch.title="Revenue by month — 2026"; ch.height=7.0; ch.width=15.0; ch.legend=None
ch.add_data(Reference(dws,min_col=2,min_row=MR1,max_row=MR2)); ch.set_categories(Reference(dws,min_col=1,min_row=MR1,max_row=MR2))
ch.y_axis.majorGridlines=None
for s in ch.series: s.graphicalProperties=GraphicalProperties(ln=LineProperties(solidFill=ACCENT,w=28000))
d.add_chart(ch,"A29")

# =====================================================================
# 2) FINANCIALS  (P&L + Cash & Liquidity + Balance Sheet)
# =====================================================================
fin=wb.create_sheet("Financials",1); fin.sheet_properties.tabColor=ACCENT; fin.sheet_view.showGridLines=False
title_block(fin,"Financials","P&L by period, cash & liquidity, and balance sheet — all SUMIFS over the Data sheet",
            "QuickBooks Online — P&L, Balance Sheet & Cash Flow")
PER=[("FY2024","FY 2024"),("FY2025","FY 2025"),("YTD2026","YTD 2026")]
section(fin,5,"Profit & Loss")
thead(fin,6,["Line item"]+[l for _,l in PER],widths=[40,18,18,18])
def per(maker): return [maker(pk) for pk,_ in PER]
R=7
line(fin,R,"Revenue",per(lambda pk:f'={sumif_gl(pk,"Revenue")}'),'$#,##0',bold=True); REV=R; R+=1
line(fin,R,"Cost of goods sold",per(lambda pk:f'={sumif_gl(pk,"COGS")}'),'$#,##0'); COGS=R; R+=1
line(fin,R,"Gross profit",[f'={get_column_letter(2+i)}{REV}-{get_column_letter(2+i)}{COGS}' for i in range(3)],'$#,##0',bold=True,total=True); GP=R; R+=1
line(fin,R,"Gross margin %",[f'=IFERROR({get_column_letter(2+i)}{GP}/{get_column_letter(2+i)}{REV},0)' for i in range(3)],'0.0%'); R+=1
line(fin,R,"Operating expenses",per(lambda pk:f'={sumif_gl(pk,"Operating Expense")}'),'$#,##0'); OPEX=R; R+=1
line(fin,R,"Other income",per(lambda pk:f'={sumif_gl(pk,"Other Income")}'),'$#,##0'); OI=R; R+=1
line(fin,R,"Other expense",per(lambda pk:f'={sumif_gl(pk,"Other Expense")}'),'$#,##0'); OE=R; R+=1
line(fin,R,"Net income",[f'={get_column_letter(2+i)}{GP}-{get_column_letter(2+i)}{OPEX}+{get_column_letter(2+i)}{OI}-{get_column_letter(2+i)}{OE}' for i in range(3)],'$#,##0',bold=True,total=True); NI=R; R+=1
line(fin,R,"Net margin %",[f'=IFERROR({get_column_letter(2+i)}{NI}/{get_column_letter(2+i)}{REV},0)' for i in range(3)],'0.0%'); R+=1
# Key ratios & metrics (CFO)
R+=1; R=ratio_block(fin,R)
# Cash & liquidity
R+=1; section(fin,R,"Cash & liquidity","QuickBooks + inputs"); R+=1
thead(fin,R,["Metric","Value"],widths=[40,18]); R+=1
liq=[("Cash balance","=SUM(tCash[CashBalance])",'$#,##0',False),
     ("Operating cash flow (YTD)","=SUM(tCash[OperatingCF])",'$#,##0',False),
     ("Financing cash flow (YTD)","=SUM(tCash[FinancingCF])",'$#,##0',False),
     ("LOC drawn","=SUM(tCash[LOCDrawn])",'$#,##0',False),
     ("LOC limit  (input)","=SUM(tCash[LOCLimit])",'$#,##0',True),
     ("LOC utilization","=IFERROR(SUM(tCash[LOCDrawn])/SUM(tCash[LOCLimit]),0)",'0.0%',False),
     ("Advance rate  (input)","=AVERAGE(tCash[AdvanceRate])",'0.0%',True),
     ("Eligible A/R  (input)","=SUM(tCash[EligibleAR])",'$#,##0',True),
     ("BBC availability (headroom)","=MIN(SUM(tCash[EligibleAR])*AVERAGE(tCash[AdvanceRate]),SUM(tCash[LOCLimit]))-SUM(tCash[LOCDrawn])",'$#,##0',False),
     ("Liquidity status",'=IF(IFERROR(SUM(tCash[LOCDrawn])/SUM(tCash[LOCLimit]),0)>=0.9,"Critical",IF(IFERROR(SUM(tCash[LOCDrawn])/SUM(tCash[LOCLimit]),0)>=0.75,"Watch","Healthy"))','General',False)]
for label,fml,fmt,inp in liq:
    put(fin,R,1,label,10,False,INK,indent=1)
    put(fin,R,2,fml,10,bool(inp),INK,fmt=fmt,align="right",fillc=("FFF3CD" if inp else None))
    for c in (1,2): fin.cell(row=R,column=c).border=Border(bottom=Side(style="thin",color=RULE))
    R+=1
# Balance sheet
R+=1; section(fin,R,"Balance sheet","QuickBooks"); R+=1
thead(fin,R,["Account","Amount"],widths=[40,18]); R+=1
for sec in ["Assets","Liabilities","Equity"]:
    for row in [x for x in bs if x["Section"]==sec]:
        acct=row["Account"].replace('"','""')
        put(fin,R,1,row["Account"],10,False,INK,indent=2)
        put(fin,R,2,f'=SUMIFS(tBS[Amount],tBS[Account],"{acct}",tBS[Section],"{sec}")',10,False,INK,fmt='$#,##0',align="right")
        for c in (1,2): fin.cell(row=R,column=c).border=Border(bottom=Side(style="thin",color=RULE))
        R+=1
    put(fin,R,1,f"Total {sec.lower()}",10,True,INK,indent=1,fillc=PANEL)
    put(fin,R,2,f'=SUMIFS(tBS[Amount],tBS[Section],"{sec}")',10,True,INK,fmt='$#,##0',align="right",fillc=PANEL)
    for c in (1,2): fin.cell(row=R,column=c).border=Border(bottom=Side(style="thin",color=ACCENT))
    R+=2

# =====================================================================
# 3) OPERATIONS  (Projects by PM + A/R + A/P aging)
# =====================================================================
op=wb.create_sheet("Operations",2); op.sheet_properties.tabColor=ACCENT; op.sheet_view.showGridLines=False
title_block(op,"Operations — Projects, A/R & A/P","Per-PM job rollups and aging — formulas over the Data sheet (job-level detail in tWIP)",
            "Knowify — Jobs/AJR  ·  QuickBooks — A/R & A/P Aging")
section(op,5,"Projects — by project manager","Knowify")
thead(op,6,["Project manager","Jobs","Contract","Invoiced","Profit $","Avg fade %"],widths=[26,8,15,15,15,11])
pms=sorted({w["PMName"] for w in wip}, key=lambda p:-sum(n(w["ContractTotal"]) for w in wip if w["PMName"]==p))
R=7
for pm in pms:
    q=pm.replace('"','""')
    put(op,R,1,pm,10,False,INK,indent=1)
    put(op,R,2,f'=COUNTIF(tWIP[PMName],"{q}")',10,False,INK,fmt='#,##0',align="right")
    put(op,R,3,f'=SUMIF(tWIP[PMName],"{q}",tWIP[ContractTotal])',10,False,INK,fmt='#,##0',align="right")
    put(op,R,4,f'=SUMIF(tWIP[PMName],"{q}",tWIP[Invoiced])',10,False,INK,fmt='#,##0',align="right")
    put(op,R,5,f'=SUMIF(tWIP[PMName],"{q}",tWIP[ProfitAmount])',10,False,INK,fmt='#,##0',align="right")
    put(op,R,6,f'=IFERROR(AVERAGEIFS(tWIP[ProfitFadePct],tWIP[PMName],"{q}",tWIP[Managed],"TRUE"),0)',10,False,INK,fmt='0.0%',align="right")
    for c in range(1,7): op.cell(row=R,column=c).border=Border(bottom=Side(style="thin",color=RULE))
    R+=1
put(op,R,1,"Total",10,True,INK,indent=1,fillc=PANEL)
for i,cl in enumerate(["B","C","D","E"]):
    put(op,R,2+i,f'=SUBTOTAL(9,{cl}7:{cl}{R-1})',10,True,INK,fmt='#,##0',align="right",fillc=PANEL)
put(op,R,6,"",fillc=PANEL)
for c in range(1,7): op.cell(row=R,column=c).border=Border(bottom=Side(style="thin",color=ACCENT))
put(op,R+1,1,"Job-level detail (profit fade, WIP net, % complete, open A/R) is on the Data sheet — table tWIP.",9,False,FAINT,italic=True)
ARB=["Current","1-30","31-60","61-90","91+"]; R=R+3
section(op,R,"Accounts receivable — aging","QuickBooks"); R+=1
thead(op,R,["A/R bucket","Amount"],widths=[26,16]); R+=1
for b in ARB:
    put(op,R,1,b,10,False,INK,indent=1); put(op,R,2,f'=SUMIFS(tAR[Amount],tAR[Bucket],"{b}",tAR[IsRetainage],"FALSE")',10,False,INK,fmt='$#,##0',align="right")
    for c in (1,2): op.cell(row=R,column=c).border=Border(bottom=Side(style="thin",color=RULE))
    R+=1
put(op,R,1,"Total trade A/R",10,True,INK,indent=1,fillc=PANEL); put(op,R,2,'=SUMIFS(tAR[Amount],tAR[IsRetainage],"FALSE")',10,True,INK,fmt='$#,##0',align="right",fillc=PANEL)
for c in (1,2): op.cell(row=R,column=c).border=Border(bottom=Side(style="thin",color=ACCENT))
R+=1
put(op,R,1,"Retainage receivable (held)",10,False,INK,indent=1); put(op,R,2,'=SUMIFS(tAR[Amount],tAR[IsRetainage],"TRUE")',10,False,ACCENT2,fmt='$#,##0',align="right"); R+=2
section(op,R,"Accounts payable — aging","QuickBooks"); R+=1
thead(op,R,["A/P bucket","Amount"],widths=[26,16]); R+=1
for b in ARB:
    put(op,R,1,b,10,False,INK,indent=1); put(op,R,2,f'=SUMIFS(tAP[Amount],tAP[Bucket],"{b}")',10,False,INK,fmt='$#,##0',align="right")
    for c in (1,2): op.cell(row=R,column=c).border=Border(bottom=Side(style="thin",color=RULE))
    R+=1
put(op,R,1,"Total A/P",10,True,INK,indent=1,fillc=PANEL); put(op,R,2,'=SUM(tAP[Amount])',10,True,INK,fmt='$#,##0',align="right",fillc=PANEL)
for c in (1,2): op.cell(row=R,column=c).border=Border(bottom=Side(style="thin",color=ACCENT))
# Concentration — top open A/R by customer, and largest jobs by remaining backlog
R+=3; section(op,R,"Customer concentration — top open A/R","QuickBooks"); R+=1
thead(op,R,["Customer","Open A/R","% of A/R"],widths=[40,15,11]); R+=1
for cust in TOPCUST:
    q=cust.replace('"','""'); put(op,R,1,cust,10,False,INK,indent=1)
    put(op,R,2,f'=SUMIFS(tAR[Amount],tAR[Customer],"{q}",tAR[IsRetainage],"FALSE")',10,False,INK,fmt='$#,##0',align="right")
    put(op,R,3,f'=IFERROR(SUMIFS(tAR[Amount],tAR[Customer],"{q}",tAR[IsRetainage],"FALSE")/{F["ar"]},0)',10,False,INK,fmt='0.0%',align="right")
    for c in (1,2,3): op.cell(row=R,column=c).border=Border(bottom=Side(style="thin",color=RULE))
    R+=1
R+=2; section(op,R,"Largest jobs by remaining backlog","Knowify"); R+=1
thead(op,R,["Job","Backlog","% of backlog"],widths=[40,15,11]); R+=1
for job in TOPJOB:
    q=job.replace('"','""'); put(op,R,1,job,10,False,INK,indent=1)
    bl=f'(SUMIF(tWIP[Job],"{q}",tWIP[ContractTotal])-SUMIF(tWIP[Job],"{q}",tWIP[Invoiced]))'
    put(op,R,2,f'={bl}',10,False,INK,fmt='$#,##0',align="right")
    put(op,R,3,f'=IFERROR({bl}/{F["backlog"]},0)',10,False,INK,fmt='0.0%',align="right")
    for c in (1,2,3): op.cell(row=R,column=c).border=Border(bottom=Side(style="thin",color=RULE))
    R+=1

# =====================================================================
# 4) JOB REVENUE BY MONTH
# =====================================================================
jr=wb.create_sheet("Job Revenue by Month",3); jr.sheet_properties.tabColor=ACCENT; jr.sheet_view.showGridLines=False
title_block(jr,"Revenue Billed by Job — 2026 (Jan–May)","Each cell is a SUMIFS over the tInv table on the Data sheet (by invoice date)",
            "Knowify — Invoices")
MONTHS=[("2026-01","Jan"),("2026-02","Feb"),("2026-03","Mar"),("2026-04","Apr"),("2026-05","May")]
thead(jr,5,["Job"]+[m for _,m in MONTHS]+["Total Jan–May"],widths=[52,13,13,13,13,13,15])
jt={}
for j,m,a in inv: jt[j]=jt.get(j,0)+a
R=6
for j in sorted(jt,key=lambda x:-jt[x]):
    q=j.replace('"','""'); put(jr,R,1,j,10,False,INK,indent=1)
    for i,(mk,_) in enumerate(MONTHS):
        put(jr,R,2+i,f'=SUMIFS(tInv[Amount],tInv[Job],"{q}",tInv[Month],"{mk}")',10,False,INK,fmt='#,##0',align="right")
    put(jr,R,7,f'=SUM(B{R}:F{R})',10,True,INK,fmt='#,##0',align="right")
    for c in range(1,8): jr.cell(row=R,column=c).border=Border(bottom=Side(style="thin",color=RULE))
    R+=1
put(jr,R,1,"Total — all jobs",10,True,INK,indent=1,fillc=PANEL)
for c in range(2,8):
    L=get_column_letter(c); put(jr,R,c,f'=SUM({L}6:{L}{R-1})',10,True,INK,fmt='#,##0',align="right",fillc=PANEL)
for c in range(1,8): jr.cell(row=R,column=c).border=Border(bottom=Side(style="thin",color=ACCENT))
jr.freeze_panes="B6"

# order: Dashboard, Financials, Operations, Job Revenue, Data
wb.move_sheet(DATASHEET, offset=len(wb.sheetnames))
wb.save(OUT)
print("Saved", OUT); print("Sheets:", wb.sheetnames)
