// Power Query M — one section per table. Set the DataFolder parameter first:
// DataFolder (Text) = the folder holding the CSVs, e.g. C:\MDG\PowerBI\data

// === Dim_Date ===
let
    Source = Csv.Document(File.Contents(DataFolder & "\Dim_Date.csv"), [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),
    Prom = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),
    Typed = Table.TransformColumnTypes(Prom, {{"Date", type date}, {"Year", Int64.Type}, {"Quarter", type text}, {"QuarterNum", Int64.Type}, {"Month", type text}, {"MonthNum", Int64.Type}, {"MonthYear", type text}, {"YearMonth", type text}, {"IsCurrentMonth", type text}})
in
    Typed

// === Dim_Division ===
let
    Source = Csv.Document(File.Contents(DataFolder & "\Dim_Division.csv"), [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),
    Prom = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),
    Typed = Table.TransformColumnTypes(Prom, {{"DivKey", type text}, {"Division", type text}, {"Sort", Int64.Type}, {"Color", type text}})
in
    Typed

// === Dim_PM ===
let
    Source = Csv.Document(File.Contents(DataFolder & "\Dim_PM.csv"), [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),
    Prom = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),
    Typed = Table.TransformColumnTypes(Prom, {{"PMName", type text}, {"ActiveJobs", Int64.Type}, {"Active", type text}})
in
    Typed

// === Dim_Job ===
let
    Source = Csv.Document(File.Contents(DataFolder & "\Dim_Job.csv"), [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),
    Prom = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),
    Typed = Table.TransformColumnTypes(Prom, {{"Job", type text}, {"ProjectId", Int64.Type}, {"DivKey", type text}, {"PMName", type text}, {"Customer", type text}, {"Status", type text}, {"ContractType", type text}, {"City", type text}, {"State", type text}, {"DateActive", type text}, {"StartDate", type text}, {"EndDate", type text}})
in
    Typed

// === Dim_Account ===
let
    Source = Csv.Document(File.Contents(DataFolder & "\Dim_Account.csv"), [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),
    Prom = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),
    Typed = Table.TransformColumnTypes(Prom, {{"Account", type text}, {"Statement", type text}, {"Category", type text}, {"Subcategory", type text}, {"DivKey", type text}, {"Sort", Int64.Type}})
in
    Typed

// === Dim_Customer ===
let
    Source = Csv.Document(File.Contents(DataFolder & "\Dim_Customer.csv"), [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),
    Prom = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),
    Typed = Table.TransformColumnTypes(Prom, {{"Customer", type text}})
in
    Typed

// === Dim_Vendor ===
let
    Source = Csv.Document(File.Contents(DataFolder & "\Dim_Vendor.csv"), [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),
    Prom = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),
    Typed = Table.TransformColumnTypes(Prom, {{"Vendor", type text}})
in
    Typed

// === Fact_GL ===
let
    Source = Csv.Document(File.Contents(DataFolder & "\Fact_GL.csv"), [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),
    Prom = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),
    Typed = Table.TransformColumnTypes(Prom, {{"Account", type text}, {"Period", type text}, {"PeriodEnd", type date}, {"DivKey", type text}, {"Amount", type number}, {"Category", type text}})
in
    Typed

// === Fact_PL_Monthly ===
let
    Source = Csv.Document(File.Contents(DataFolder & "\Fact_PL_Monthly.csv"), [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),
    Prom = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),
    Typed = Table.TransformColumnTypes(Prom, {{"MonthEnd", type date}, {"Revenue", type number}, {"COGS", type number}, {"GrossProfit", type number}, {"OpEx", type number}, {"NetIncome", type number}, {"GrossMarginPct", type number}, {"NetMarginPct", type number}})
in
    Typed

// === Fact_WIP ===
let
    Source = Csv.Document(File.Contents(DataFolder & "\Fact_WIP.csv"), [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),
    Prom = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),
    Typed = Table.TransformColumnTypes(Prom, {{"SnapshotDate", type date}, {"ProjectId", Int64.Type}, {"Job", type text}, {"DivKey", type text}, {"PMName", type text}, {"Customer", type text}, {"Status", type text}, {"ContractTotal", type number}, {"ChangeOrders", type number}, {"Invoiced", type number}, {"PaymentsInvoices", type number}, {"BudgetTotal", type number}, {"ActualCost", type number}, {"PctComplete", type number}, {"EarnedRevenue", type number}, {"WIPNet", type number}, {"KnowifyWIP", type number}, {"Overbilled", type number}, {"Underbilled", type number}, {"ProfitAmount", type number}, {"ProfitPct", type number}, {"ProjectedProfit", type number}, {"ProjectedProfitPct", type number}, {"EstMarginPct", type number}, {"ProfitFadePct", type number}, {"Retainage", type number}, {"OpenAR", type number}, {"HasBudget", type text}, {"Managed", type text}})
in
    Typed

// === Fact_AR ===
let
    Source = Csv.Document(File.Contents(DataFolder & "\Fact_AR.csv"), [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),
    Prom = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),
    Typed = Table.TransformColumnTypes(Prom, {{"Customer", type text}, {"Bucket", type text}, {"Amount", type number}, {"IsRetainage", type text}, {"AsOfDate", type date}})
in
    Typed

// === Fact_AP ===
let
    Source = Csv.Document(File.Contents(DataFolder & "\Fact_AP.csv"), [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),
    Prom = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),
    Typed = Table.TransformColumnTypes(Prom, {{"Vendor", type text}, {"Bucket", type text}, {"Amount", type number}, {"AsOfDate", type date}})
in
    Typed

// === Fact_Cash ===
let
    Source = Csv.Document(File.Contents(DataFolder & "\Fact_Cash.csv"), [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),
    Prom = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),
    Typed = Table.TransformColumnTypes(Prom, {{"Date", type date}, {"CashBalance", type number}, {"LOCDrawn", type number}, {"LOCCapX", type number}, {"OperatingCF", type number}, {"InvestingCF", type number}, {"FinancingCF", type number}, {"NetCashChange", type number}, {"LOCLimit", type number}, {"AdvanceRate", type number}, {"EligibleAR", type number}})
in
    Typed

// === Fact_Budget ===
let
    Source = Csv.Document(File.Contents(DataFolder & "\Fact_Budget.csv"), [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),
    Prom = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),
    Typed = Table.TransformColumnTypes(Prom, {{"DivKey", type text}, {"Period", type text}, {"ContractTotal", type number}, {"BudgetTotal", type number}, {"ActualCost", type number}, {"Invoiced", type number}})
in
    Typed

// === Fact_BalanceSheet ===
let
    Source = Csv.Document(File.Contents(DataFolder & "\Fact_BalanceSheet.csv"), [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),
    Prom = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),
    Typed = Table.TransformColumnTypes(Prom, {{"Account", type text}, {"Section", type text}, {"Amount", type number}, {"AsOfDate", type date}})
in
    Typed

