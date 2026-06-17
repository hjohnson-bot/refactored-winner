#!/usr/bin/env python3
"""
Generate the Power BI kit from the CSVs:
  powerbi/model.bim           TMSL semantic model (tables, M partitions, relationships,
                              hierarchies, full DAX measure library)
  powerbi/MDG_Theme.json      brand theme (spec section 10)
  powerbi/measures.dax        readable DAX measure reference
  powerbi/powerquery_all.m    consolidated Power Query M
The model reads the CSVs via a single 'DataFolder' parameter the user sets once.
"""
import csv, os, json

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DATA = os.path.join(ROOT, "data")
PBI  = os.path.join(ROOT, "powerbi")
os.makedirs(PBI, exist_ok=True)

# ---- column typing ----
DATE_COLS  = {"Date","PeriodEnd","MonthEnd","SnapshotDate","AsOfDate"}
INT_COLS   = {"ProjectId","Sort","MonthNum","Year","QuarterNum","ActiveJobs"}
def col_type(table, col, sample):
    if col in DATE_COLS: return "dateTime"
    if col in INT_COLS:  return "int64"
    try:
        float(sample);
        # treat known text-ish numerics as string
        if col in ("Date","StartDate","DateActive","EndDate"): return "string"
        return "double"
    except (TypeError, ValueError):
        return "string"

def headers_and_sample(csvfile):
    with open(os.path.join(DATA, csvfile), encoding="utf-8") as f:
        r = csv.reader(f); hdr = next(r)
        try: row = next(r)
        except StopIteration: row = [""]*len(hdr)
    return hdr, row

TABLES = [
    ("Dim_Date","Dim_Date.csv"), ("Dim_Division","Dim_Division.csv"),
    ("Dim_PM","Dim_PM.csv"), ("Dim_Job","Dim_Job.csv"),
    ("Dim_Account","Dim_Account.csv"), ("Dim_Customer","Dim_Customer.csv"),
    ("Dim_Vendor","Dim_Vendor.csv"),
    ("Fact_GL","Fact_GL.csv"), ("Fact_PL_Monthly","Fact_PL_Monthly.csv"),
    ("Fact_WIP","Fact_WIP.csv"), ("Fact_AR","Fact_AR.csv"),
    ("Fact_AP","Fact_AP.csv"), ("Fact_Cash","Fact_Cash.csv"),
    ("Fact_Budget","Fact_Budget.csv"), ("Fact_BalanceSheet","Fact_BalanceSheet.csv"),
]

PQ_TYPE = {"dateTime":"type date","int64":"Int64.Type","double":"type number","string":"type text"}

def m_for(table, csvfile, hdr, sample):
    casts = ", ".join('{"%s", %s}' % (h, PQ_TYPE[col_type(table,h,sample[i] if i<len(sample) else "")])
                      for i,h in enumerate(hdr))
    return (
        "let\n"
        f'    Source = Csv.Document(File.Contents(DataFolder & "\\{csvfile}"), '
        "[Delimiter=\",\", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),\n"
        "    Prom = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),\n"
        f"    Typed = Table.TransformColumnTypes(Prom, {{{casts}}})\n"
        "in\n    Typed"
    )

def columns_for(table, hdr, sample):
    cols=[]
    for i,h in enumerate(hdr):
        cols.append({"name":h,"dataType":col_type(table,h,sample[i] if i<len(sample) else ""),
                     "sourceColumn":h})
    return cols

# ---- DAX measures (adapted to the real CSV schema; P&L stored positive by Category) ----
MEASURES = {
"_Measures": [
 # P&L core
 ("GL Amount","SUM ( Fact_GL[Amount] )","#,##0"),
 ("Total Revenue",'CALCULATE ( [GL Amount], Dim_Account[Category] = "Revenue" )',"\\$#,##0"),
 ("Total COGS",'CALCULATE ( [GL Amount], Dim_Account[Category] = "COGS" )',"\\$#,##0"),
 ("Gross Profit","[Total Revenue] - [Total COGS]","\\$#,##0"),
 ("Gross Margin %","DIVIDE ( [Gross Profit], [Total Revenue] )","0.0%"),
 ("Total OpEx",'CALCULATE ( [GL Amount], Dim_Account[Category] = "Operating Expense" )',"\\$#,##0"),
 ("Other Income",'CALCULATE ( [GL Amount], Dim_Account[Category] = "Other Income" )',"\\$#,##0"),
 ("Other Expense",'CALCULATE ( [GL Amount], Dim_Account[Category] = "Other Expense" )',"\\$#,##0"),
 ("Net Income","[Gross Profit] - [Total OpEx] + [Other Income] - [Other Expense]","\\$#,##0"),
 ("Net Margin %","DIVIDE ( [Net Income], [Total Revenue] )","0.0%"),
 # Monthly trend + time intelligence (Fact_PL_Monthly is date-grained)
 ("Revenue (Monthly)","SUM ( Fact_PL_Monthly[Revenue] )","\\$#,##0"),
 ("Net Income (Monthly)","SUM ( Fact_PL_Monthly[NetIncome] )","\\$#,##0"),
 ("Revenue YTD","TOTALYTD ( [Revenue (Monthly)], Dim_Date[Date] )","\\$#,##0"),
 ("Revenue PY","CALCULATE ( [Revenue (Monthly)], SAMEPERIODLASTYEAR ( Dim_Date[Date] ) )","\\$#,##0"),
 ("Revenue YoY %","DIVIDE ( [Revenue (Monthly)] - [Revenue PY], [Revenue PY] )","0.0%"),
 ("Revenue TTM","CALCULATE ( [Revenue (Monthly)], DATESINPERIOD ( Dim_Date[Date], MAX ( Dim_Date[Date] ), -12, MONTH ) )","\\$#,##0"),
 # WIP / profit fade (Knowify AJR)
 ("Contract Total","SUM ( Fact_WIP[ContractTotal] )","\\$#,##0"),
 ("Invoiced","SUM ( Fact_WIP[Invoiced] )","\\$#,##0"),
 ("Earned Revenue","SUM ( Fact_WIP[EarnedRevenue] )","\\$#,##0"),
 ("WIP Net","SUM ( Fact_WIP[WIPNet] )","\\$#,##0"),
 ("Overbilling","SUM ( Fact_WIP[Overbilled] )","\\$#,##0"),
 ("Underbilling","SUM ( Fact_WIP[Underbilled] )","\\$#,##0"),
 ("Backlog","[Contract Total] - [Invoiced]","\\$#,##0"),
 ("Job Profit $","SUM ( Fact_WIP[ProfitAmount] )","\\$#,##0"),
 ("Projected Profit $","SUM ( Fact_WIP[ProjectedProfit] )","\\$#,##0"),
 ("Job Profit %","DIVIDE ( [Job Profit $], [Contract Total] )","0.0%"),
 ("Avg Profit Fade %",'AVERAGEX ( FILTER ( Fact_WIP, Fact_WIP[Managed] = "TRUE" ), Fact_WIP[ProfitFadePct] )',"0.0%"),
 ("Jobs Fading",'CALCULATE ( COUNTROWS ( Fact_WIP ), Fact_WIP[Managed] = "TRUE", Fact_WIP[ProfitFadePct] < -0.02 )',"#,##0"),
 ("Managed Jobs",'CALCULATE ( COUNTROWS ( Fact_WIP ), Fact_WIP[Managed] = "TRUE" )',"#,##0"),
 ("Active Jobs","COUNTROWS ( Fact_WIP )","#,##0"),
 ("Retainage (WIP)","SUM ( Fact_WIP[Retainage] )","\\$#,##0"),
 # AR aging
 ("Total AR",'CALCULATE ( SUM ( Fact_AR[Amount] ), Fact_AR[IsRetainage] = "FALSE" )',"\\$#,##0"),
 ("AR Retainage",'CALCULATE ( SUM ( Fact_AR[Amount] ), Fact_AR[IsRetainage] = "TRUE" )',"\\$#,##0"),
 ("AR Current",'CALCULATE ( SUM ( Fact_AR[Amount] ), Fact_AR[Bucket] = "Current", Fact_AR[IsRetainage] = "FALSE" )',"\\$#,##0"),
 ("AR 1-30",'CALCULATE ( SUM ( Fact_AR[Amount] ), Fact_AR[Bucket] = "1-30", Fact_AR[IsRetainage] = "FALSE" )',"\\$#,##0"),
 ("AR 31-60",'CALCULATE ( SUM ( Fact_AR[Amount] ), Fact_AR[Bucket] = "31-60", Fact_AR[IsRetainage] = "FALSE" )',"\\$#,##0"),
 ("AR 61-90",'CALCULATE ( SUM ( Fact_AR[Amount] ), Fact_AR[Bucket] = "61-90", Fact_AR[IsRetainage] = "FALSE" )',"\\$#,##0"),
 ("AR 91+",'CALCULATE ( SUM ( Fact_AR[Amount] ), Fact_AR[Bucket] = "91+", Fact_AR[IsRetainage] = "FALSE" )',"\\$#,##0"),
 ("AR % of Revenue","DIVIDE ( [Total AR], [Total Revenue] )","0.0%"),
 # AP
 ("Total AP","SUM ( Fact_AP[Amount] )","\\$#,##0"),
 # Cash / liquidity
 ("Cash Balance","SUM ( Fact_Cash[CashBalance] )","\\$#,##0"),
 ("LOC Drawn","SUM ( Fact_Cash[LOCDrawn] )","\\$#,##0"),
 ("LOC Limit","SUM ( Fact_Cash[LOCLimit] )","\\$#,##0"),
 ("LOC Utilization %","DIVIDE ( [LOC Drawn], [LOC Limit] )","0.0%"),
 ("Operating Cash Flow","SUM ( Fact_Cash[OperatingCF] )","\\$#,##0"),
 ("BBC Availability",
  "VAR _base = SUMX ( Fact_Cash, Fact_Cash[EligibleAR] * Fact_Cash[AdvanceRate] )\n"
  "VAR _cap = MIN ( _base, [LOC Limit] )\nRETURN _cap - [LOC Drawn]","\\$#,##0"),
 ("Liquidity Status",
  'SWITCH ( TRUE(), [LOC Utilization %] >= 0.90, "Critical", '
  '[LOC Utilization %] >= 0.75, "Watch", "Healthy" )',None),
 # Budget vs actual (job-cost AJR)
 ("Budget Cost","SUM ( Fact_Budget[BudgetTotal] )","\\$#,##0"),
 ("Actual Cost","SUM ( Fact_Budget[ActualCost] )","\\$#,##0"),
 ("Cost Variance $","[Budget Cost] - [Actual Cost]","\\$#,##0"),
 # Data health
 ("Unallocated GL",'CALCULATE ( [GL Amount], Dim_Division[DivKey] = "UN" )',"\\$#,##0"),
 ("Jobs Missing PM",'CALCULATE ( COUNTROWS ( Fact_WIP ), Fact_WIP[PMName] = "(Unassigned)" )',"#,##0"),
]
}

RELATIONSHIPS = [
 ("Dim_Date","Date","Fact_GL","PeriodEnd"),
 ("Dim_Date","Date","Fact_PL_Monthly","MonthEnd"),
 ("Dim_Date","Date","Fact_WIP","SnapshotDate"),
 ("Dim_Date","Date","Fact_AR","AsOfDate"),
 ("Dim_Date","Date","Fact_AP","AsOfDate"),
 ("Dim_Date","Date","Fact_Cash","Date"),
 ("Dim_Division","DivKey","Fact_GL","DivKey"),
 ("Dim_Division","DivKey","Fact_WIP","DivKey"),
 ("Dim_Division","DivKey","Fact_Budget","DivKey"),
 ("Dim_PM","PMName","Fact_WIP","PMName"),
 ("Dim_Job","Job","Fact_WIP","Job"),
 ("Dim_Account","Account","Fact_GL","Account"),
 ("Dim_Customer","Customer","Fact_AR","Customer"),
 ("Dim_Vendor","Vendor","Fact_AP","Vendor"),
]

def build_bim():
    tables=[]
    # data tables
    for tname, csvfile in TABLES:
        hdr, sample = headers_and_sample(csvfile)
        t={"name":tname,"columns":columns_for(tname,hdr,sample),
           "partitions":[{"name":tname,"mode":"import",
                          "source":{"type":"m","expression":m_for(tname,csvfile,hdr,sample)}}]}
        if tname=="Dim_Date":
            t["dataCategory"]="Time"
            for c in t["columns"]:
                if c["name"]=="Date": c["isKey"]=True
        if tname=="Dim_Job":
            t["hierarchies"]=[{"name":"Org Hierarchy","levels":[
                {"name":"Division","ordinal":0,"column":"DivKey"},
                {"name":"Project Manager","ordinal":1,"column":"PMName"},
                {"name":"Job","ordinal":2,"column":"Job"}]}]
        if tname=="Dim_Account":
            t["hierarchies"]=[{"name":"Account Hierarchy","levels":[
                {"name":"Category","ordinal":0,"column":"Category"},
                {"name":"Subcategory","ordinal":1,"column":"Subcategory"},
                {"name":"Account","ordinal":2,"column":"Account"}]}]
        tables.append(t)
    # measures host
    meas=[]
    for name, expr, fmt in MEASURES["_Measures"]:
        m={"name":name,"expression":expr}
        if fmt: m["formatString"]=fmt
        meas.append(m)
    tables.append({"name":"_Measures",
        "columns":[{"name":"_","dataType":"int64","sourceColumn":"_","isHidden":True}],
        "partitions":[{"name":"_Measures","mode":"import",
            "source":{"type":"m","expression":'let Source = #table({"_"},{{1}}) in Source'}}],
        "measures":meas})
    rels=[]
    for i,(ft,fc,tt,tc) in enumerate(RELATIONSHIPS):
        rels.append({"name":f"rel_{i}","fromTable":tt,"fromColumn":tc,
                     "toTable":ft,"toColumn":fc,
                     "crossFilteringBehavior":"oneDirection"})
    model={"name":"MDG Executive Model","compatibilityLevel":1567,
      "model":{"culture":"en-US",
        "expressions":[{"name":"DataFolder","kind":"m",
          "expression":'"C:\\MDG\\PowerBI\\data" meta [IsParameterQuery=true, Type="Text", IsParameterQueryRequired=true]'}],
        "tables":tables,"relationships":rels,
        "annotations":[{"name":"BuildSource","value":"QuickBooks Online + Knowify (live MCP)"}]}}
    return model

bim=build_bim()
with open(os.path.join(PBI,"model.bim"),"w",encoding="utf-8") as fh:
    json.dump(bim,fh,indent=2)
print("wrote model.bim")

# measures.dax reference
with open(os.path.join(PBI,"measures.dax"),"w",encoding="utf-8") as fh:
    fh.write("// MDG Executive Model — DAX measure library\n")
    fh.write("// Paste into Tabular Editor or recreate in Power BI Desktop.\n\n")
    for name, expr, fmt in MEASURES["_Measures"]:
        fh.write(f"{name} =\n{expr}\n\n")
print("wrote measures.dax")

# consolidated M
with open(os.path.join(PBI,"powerquery_all.m"),"w",encoding="utf-8") as fh:
    fh.write("// Power Query M — one section per table. Set the DataFolder parameter first:\n")
    fh.write('// DataFolder (Text) = the folder holding the CSVs, e.g. C:\\MDG\\PowerBI\\data\n\n')
    for tname,csvfile in TABLES:
        hdr,sample=headers_and_sample(csvfile)
        fh.write(f"// === {tname} ===\n{m_for(tname,csvfile,hdr,sample)}\n\n")
print("wrote powerquery_all.m")

# theme
theme={"name":"MDG Executive (Dark)",
 "dataColors":["#029CF5","#6E7585","#4F8FC7","#515967","#3A4150","#35C77F","#FF6B6B","#F4B740"],
 "background":"#15171F","foreground":"#FFFFFF","tableAccent":"#029CF5",
 "good":"#35C77F","neutral":"#6E7585","bad":"#FF6B6B",
 "textClasses":{
   "title":{"fontFace":"Segoe UI Semibold","fontSize":14,"color":"#FFFFFF"},
   "header":{"fontFace":"Segoe UI","fontSize":12,"color":"#9AA3B2"},
   "label":{"fontFace":"Segoe UI","fontSize":10,"color":"#FFFFFF"},
   "callout":{"fontFace":"Segoe UI Semibold","fontSize":28,"color":"#FFFFFF"}}}
with open(os.path.join(PBI,"MDG_Theme.json"),"w",encoding="utf-8") as fh:
    json.dump(theme,fh,indent=2)
print("wrote MDG_Theme.json")
print(f"\nModel: {len(bim['model']['tables'])} tables, "
      f"{len(bim['model']['relationships'])} relationships, "
      f"{len(MEASURES['_Measures'])} measures")
