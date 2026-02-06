// ════════════════════════════════════════════════════════════════
// DUKA POS - EXCEL EXPORT MODULE
// ════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════
// EXPORT COMMISSION REPORT TO EXCEL
// ════════════════════════════════════════════════════════════════
async function exportCommissionToExcel(cashierData, startDate, endDate, commissionRate) {
    try {
        const fileName = `Commission_Report_${new Date().toISOString().split('T')[0]}.xlsx`;
        const filePath = `/mnt/user-data/outputs/${fileName}`;

        // Prepare data for Python script
        const reportData = {
            cashiers: cashierData,
            startDate: startDate,
            endDate: endDate,
            commissionRate: commissionRate,
            generatedAt: new Date().toISOString(),
            fileName: fileName
        };

        // Save report data as JSON
        const jsonPath = '/tmp/commission_report_data.json';
        await window.bash_tool({
            command: `cat > ${jsonPath} << 'EOFDATA'
${JSON.stringify(reportData, null, 2)}
EOFDATA`,
            description: 'Save commission report data for Excel export'
        });

        // Create Python script to generate Excel
        const pythonScript = `
import pandas as pd
import json
from datetime import datetime
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

# Load data
with open('${jsonPath}', 'r') as f:
    data = json.load(f)

# Create Excel writer
output_path = '${filePath}'
writer = pd.ExcelWriter(output_path, engine='openpyxl')

# Prepare summary data
summary_df = pd.DataFrame([
    ['Report Period:', f"{data['startDate'][:10]} to {data['endDate'][:10]}"],
    ['Commission Rate:', f"{data['commissionRate']}%"],
    ['Generated:', data['generatedAt'][:19]],
    ['', ''],
])
summary_df.to_excel(writer, sheet_name='Commission Report', index=False, header=False, startrow=0)

# Prepare cashier data
cashier_records = []
for idx, cashier in enumerate(data['cashiers'], 1):
    cashier_records.append({
        'Rank': idx,
        'Cashier Name': cashier['full_name'],
        'Username': cashier['username'],
        'Transactions': cashier['total_transactions'],
        'Items Sold': cashier['items_sold'],
        'Revenue (KES)': round(cashier['total_revenue'], 2),
        'Cost (KES)': round(cashier['total_cost'], 2),
        'Profit (KES)': round(cashier['total_profit'], 2),
        'Profit Margin (%)': round(cashier['profit_margin'], 2),
        'Commission (KES)': round(cashier['commission_amount'], 2)
    })

cashier_df = pd.DataFrame(cashier_records)
cashier_df.to_excel(writer, sheet_name='Commission Report', index=False, startrow=6)

# Format the worksheet
workbook = writer.book
worksheet = writer.sheets['Commission Report']

# Style header section
header_fill = PatternFill(start_color='4472C4', end_color='4472C4', fill_type='solid')
header_font = Font(bold=True, color='FFFFFF', size=12)

for row in range(1, 4):
    cell = worksheet.cell(row=row, column=1)
    cell.font = Font(bold=True, size=11)
    cell = worksheet.cell(row=row, column=2)
    cell.font = Font(size=11)

# Style table header
for col in range(1, len(cashier_df.columns) + 1):
    cell = worksheet.cell(row=7, column=col)
    cell.fill = header_fill
    cell.font = header_font
    cell.alignment = Alignment(horizontal='center', vertical='center')

# Style data rows
thin_border = Border(
    left=Side(style='thin'),
    right=Side(style='thin'),
    top=Side(style='thin'),
    bottom=Side(style='thin')
)

for row in range(8, 8 + len(cashier_df)):
    for col in range(1, len(cashier_df.columns) + 1):
        cell = worksheet.cell(row=row, column=col)
        cell.border = thin_border
        cell.alignment = Alignment(horizontal='center' if col <= 3 else 'right', vertical='center')
        
        # Format currency columns
        if col in [6, 7, 8, 10]:  # Revenue, Cost, Profit, Commission
            cell.number_format = '#,##0.00'
        elif col == 9:  # Profit Margin
            cell.number_format = '0.00'

# Highlight top performers
gold_fill = PatternFill(start_color='FFD700', end_color='FFD700', fill_type='solid')
silver_fill = PatternFill(start_color='C0C0C0', end_color='C0C0C0', fill_type='solid')
bronze_fill = PatternFill(start_color='CD7F32', end_color='CD7F32', fill_type='solid')

if len(cashier_df) >= 1:
    for col in range(1, len(cashier_df.columns) + 1):
        worksheet.cell(row=8, column=col).fill = gold_fill
if len(cashier_df) >= 2:
    for col in range(1, len(cashier_df.columns) + 1):
        worksheet.cell(row=9, column=col).fill = silver_fill
if len(cashier_df) >= 3:
    for col in range(1, len(cashier_df.columns) + 1):
        worksheet.cell(row=10, column=col).fill = bronze_fill

# Set column widths
column_widths = [8, 20, 15, 12, 12, 15, 15, 15, 15, 15]
for idx, width in enumerate(column_widths, 1):
    worksheet.column_dimensions[get_column_letter(idx)].width = width

# Add totals row
total_row = 8 + len(cashier_df)
worksheet.cell(row=total_row, column=1).value = 'TOTAL'
worksheet.cell(row=total_row, column=1).font = Font(bold=True, size=11)

# Calculate totals
total_transactions = sum(c['total_transactions'] for c in data['cashiers'])
total_items = sum(c['items_sold'] for c in data['cashiers'])
total_revenue = sum(c['total_revenue'] for c in data['cashiers'])
total_cost = sum(c['total_cost'] for c in data['cashiers'])
total_profit = sum(c['total_profit'] for c in data['cashiers'])
total_commission = sum(c['commission_amount'] for c in data['cashiers'])

worksheet.cell(row=total_row, column=4).value = total_transactions
worksheet.cell(row=total_row, column=5).value = total_items
worksheet.cell(row=total_row, column=6).value = total_revenue
worksheet.cell(row=total_row, column=7).value = total_cost
worksheet.cell(row=total_row, column=8).value = total_profit
worksheet.cell(row=total_row, column=10).value = total_commission

# Format totals row
totals_fill = PatternFill(start_color='E7E6E6', end_color='E7E6E6', fill_type='solid')
for col in range(1, len(cashier_df.columns) + 1):
    cell = worksheet.cell(row=total_row, column=col)
    cell.fill = totals_fill
    cell.font = Font(bold=True)
    cell.border = thin_border
    if col in [6, 7, 8, 10]:
        cell.number_format = '#,##0.00'

writer.close()
print(f'Excel report generated: {output_path}')
`;

        // Save Python script
        const scriptPath = '/tmp/generate_excel_report.py';
        await window.bash_tool({
            command: `cat > ${scriptPath} << 'EOFSCRIPT'
${pythonScript}
EOFSCRIPT`,
            description: 'Create Python script for Excel generation'
        });

        // Install required packages
        await window.bash_tool({
            command: 'pip install pandas openpyxl --break-system-packages -q',
            description: 'Install required Python packages'
        });

        // Run the Python script
        await window.bash_tool({
            command: `python3 ${scriptPath}`,
            description: 'Generate Excel report'
        });

        console.log('✅ Excel report generated:', filePath);
        return { success: true, filePath, fileName };

    } catch (error) {
        console.error('❌ Export to Excel failed:', error);
        return { success: false, error: error.message };
    }
}

// ════════════════════════════════════════════════════════════════
// EXPORT DETAILED CASHIER REPORT TO EXCEL
// ════════════════════════════════════════════════════════════════
async function exportCashierDetailToExcel(report, commissionRate) {
    try {
        const cashierName = report.user.full_name.replace(/\s+/g, '_');
        const fileName = `Cashier_Report_${cashierName}_${new Date().toISOString().split('T')[0]}.xlsx`;
        const filePath = `/mnt/user-data/outputs/${fileName}`;

        // Calculate commission
        const commission = report.summary.total_profit * (commissionRate / 100);

        // Prepare data for Python script
        const reportData = {
            user: report.user,
            summary: {
                ...report.summary,
                commission: commission,
                commission_rate: commissionRate
            },
            dailyBreakdown: report.dailyBreakdown,
            sales: report.sales,
            fileName: fileName
        };

        const jsonPath = '/tmp/cashier_detail_data.json';
        await window.bash_tool({
            command: `cat > ${jsonPath} << 'EOFDATA'
${JSON.stringify(reportData, null, 2)}
EOFDATA`,
            description: 'Save cashier detail data for Excel export'
        });

        const pythonScript = `
import pandas as pd
import json
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

# Load data
with open('${jsonPath}', 'r') as f:
    data = json.load(f)

output_path = '${filePath}'
writer = pd.ExcelWriter(output_path, engine='openpyxl')

# Summary Sheet
summary_data = [
    ['CASHIER PERFORMANCE REPORT', ''],
    ['', ''],
    ['Cashier:', data['user']['full_name']],
    ['Username:', data['user']['username']],
    ['Role:', data['user']['role']],
    ['Report Date:', '${new Date().toLocaleDateString()}'],
    ['', ''],
    ['SUMMARY METRICS', ''],
    ['Total Transactions:', data['summary']['total_transactions']],
    ['Items Sold:', data['summary']['items_sold']],
    ['Total Revenue (KES):', round(data['summary']['total_revenue'], 2)],
    ['Total Cost (KES):', round(data['summary']['total_cost'], 2)],
    ['Total Profit (KES):', round(data['summary']['total_profit'], 2)],
    ['Profit Margin (%):', round(data['summary']['profit_margin'], 2)],
    ['Commission Rate (%):', data['summary']['commission_rate']],
    ['Commission Amount (KES):', round(data['summary']['commission'], 2)],
]
summary_df = pd.DataFrame(summary_data)
summary_df.to_excel(writer, sheet_name='Summary', index=False, header=False)

# Daily Breakdown Sheet
daily_records = []
for day in data['dailyBreakdown']:
    daily_records.append({
        'Date': day['date'],
        'Transactions': day['transactions'],
        'Items Sold': day['items'],
        'Revenue (KES)': round(day['revenue'], 2),
        'Cost (KES)': round(day['cost'], 2),
        'Profit (KES)': round(day['profit'], 2)
    })
daily_df = pd.DataFrame(daily_records)
daily_df.to_excel(writer, sheet_name='Daily Breakdown', index=False)

# Transactions Sheet
transaction_records = []
for sale in data['sales']:
    transaction_records.append({
        'Date': sale['created_at'][:10],
        'Time': sale['created_at'][11:19],
        'Transaction ID': sale['id'],
        'Items': sale['items_sold'],
        'Revenue (KES)': round(sale['total_amount'], 2),
        'Cost (KES)': round(sale['total_cost'], 2),
        'Profit (KES)': round(sale['total_profit'], 2),
        'Margin (%)': float(sale['profit_margin']),
        'Payment': sale['payment_method']
    })
trans_df = pd.DataFrame(transaction_records)
trans_df.to_excel(writer, sheet_name='Transactions', index=False)

# Format worksheets
workbook = writer.book

# Format Summary Sheet
ws_summary = writer.sheets['Summary']
ws_summary.cell(row=1, column=1).font = Font(bold=True, size=14)
for row in [3, 4, 5, 6]:
    ws_summary.cell(row=row, column=1).font = Font(bold=True)
ws_summary.cell(row=8, column=1).font = Font(bold=True, size=12)
for row in range(9, 17):
    ws_summary.cell(row=row, column=1).font = Font(bold=True)
    if row in [11, 12, 13, 16]:  # Currency values
        ws_summary.cell(row=row, column=2).number_format = '#,##0.00'
ws_summary.column_dimensions['A'].width = 25
ws_summary.column_dimensions['B'].width = 20

# Format Daily Breakdown
ws_daily = writer.sheets['Daily Breakdown']
header_fill = PatternFill(start_color='4472C4', end_color='4472C4', fill_type='solid')
header_font = Font(bold=True, color='FFFFFF')
for col in range(1, len(daily_df.columns) + 1):
    cell = ws_daily.cell(row=1, column=col)
    cell.fill = header_fill
    cell.font = header_font
    ws_daily.column_dimensions[get_column_letter(col)].width = 15

# Format Transactions
ws_trans = writer.sheets['Transactions']
for col in range(1, len(trans_df.columns) + 1):
    cell = ws_trans.cell(row=1, column=col)
    cell.fill = header_fill
    cell.font = header_font
    ws_trans.column_dimensions[get_column_letter(col)].width = 15

writer.close()
print(f'Cashier detail report generated: {output_path}')
`;

        const scriptPath = '/tmp/generate_cashier_excel.py';
        await window.bash_tool({
            command: `cat > ${scriptPath} << 'EOFSCRIPT'
${pythonScript}
EOFSCRIPT`,
            description: 'Create Python script for cashier Excel'
        });

        await window.bash_tool({
            command: `python3 ${scriptPath}`,
            description: 'Generate cashier Excel report'
        });

        console.log('✅ Cashier Excel report generated:', filePath);
        return { success: true, filePath, fileName };

    } catch (error) {
        console.error('❌ Export cashier detail to Excel failed:', error);
        return { success: false, error: error.message };
    }
}

// ════════════════════════════════════════════════════════════════
// EXPOSE FUNCTIONS TO GLOBAL SCOPE
// ════════════════════════════════════════════════════════════════
window.excelExport = {
    exportCommissionToExcel,
    exportCashierDetailToExcel
};