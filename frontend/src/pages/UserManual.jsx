import { useMemo } from 'react';
import { useAuth, roleLabel, isPlatformRole } from '../auth';
import {
    BookOpenIcon, ShieldCheckIcon, ChartPieIcon, ClipboardDocumentListIcon,
    CalendarDaysIcon, PaperClipIcon, SparklesIcon, Cog6ToothIcon
} from '@heroicons/react/24/outline';

const updatedAt = '2026-06-08';

const quickStart = [
    ['เลือก Team / Tenant', 'ผู้ใช้ทั่วไปเข้าใช้งานตาม tenant ของตัวเอง ส่วน TenantAdmin/TenantUser สามารถเลือก tenant บางหน้าที่รองรับได้'],
    ['เลือกปี', 'ใช้ Year selector ด้านขวาบน หรือปุ่ม This Year เพื่อกลับมาปีปัจจุบัน'],
    ['ดู Dashboard', 'หน้า Summary และ dashboard ย่อยแสดงข้อมูลจาก project/revenue detail ที่บันทึกในระบบ'],
    ['จัดการข้อมูล', 'Admin/Superadmin ใช้เมนู Administration และ Superadmin สำหรับตั้งค่าและบันทึกข้อมูลหลัก'],
    ['อ่านคู่มือ', 'กด User Manual ด้านขวาบน ระบบจะเปิดคู่มือใน tab ใหม่']
];

const dashboardSections = [
    ['Summary', 'ภาพรวม revenue, target, gap และรายละเอียดตามหมวด revenue ของปีที่เลือก'],
    ['Project Summary', 'สรุปข้อมูลระดับ Project Code รวม Project Value, Revenue, Cost, Margin, Recognized และ attachment icon สามารถกดดู/download/preview ไฟล์ได้ ตารางลากซ้ายขวาได้'],
    ['Pipeline Dashboard', 'ดู pipeline แบบ read-only พร้อม revenue summary, Service Revenue breakdown popup และ latest note พร้อม View More'],
    ['Subscription / Perpetual / Implementation / Service MA / Outsource', 'Dashboard รายหมวดสำหรับตรวจสอบตัวเลขและ recognition ตามปีที่เลือก'],
    ['Resource Planning', 'แผน resource assignment แบบ gantt ตาม project/resource/role'],
    ['Office Booking', 'จองวันเข้า office, ลบ booking ของตัวเองที่ยังไม่ผ่าน, bulk booking ตาม weekday, ดู summary และวันหยุด'],
    ['Post-It Board', 'กระดานฝากข้อความแบบไม่แสดงตัวตนผู้เขียน รองรับ edit/reply/extend/delete post-it ของตัวเอง'],
    ['Knowledge Base', 'ค้นหา อ่าน เพิ่ม แก้ไข article พร้อม category/product/tags/attachments/history และ AI Search เมื่อ config พร้อม']
];

const adminSections = [
    ['Project Management', 'เพิ่ม/แก้ไข/ลบ project, upload attachment สูงสุด 50 MB ต่อไฟล์, เปลี่ยน document category ของไฟล์, preview/download, และเมื่อแก้ Main Start/End Date ระบบเลื่อนวันที่ detail ย่อยตามจำนวนวันที่เปลี่ยน'],
    ['Pipeline Management', 'จัดการเฉพาะ project สถานะ Pipeline, สร้าง pipeline จาก Excel Budget File, ใช้ AI Prompt หรือ fallback parser, add/delete note history และ edit project ด้วย editor เดียวกับ Project Management'],
    ['Pipeline AI Prompt', 'ตั้ง prompt สำหรับดึงค่า budget จาก Excel แบบหนึ่ง field ต่อหนึ่ง prompt เปิด/ปิดแต่ละ prompt ได้ ถ้าปิดจะใช้ parser เดิม'],
    ['Customers', 'จัดการข้อมูล customer, logo, contact, account manager และสีประจำ customer'],
    ['Resources', 'จัดการ resource, mapping/create user, role dropdown, social links, AI Suggest และให้ user แก้ resource information ของตัวเองได้'],
    ['License Management', 'จัดการ license ของ customer และ import license จาก PDF'],
    ['Year Config', 'กำหนด headcount และ revenue per headcount รายปี'],
    ['App Config', 'ตั้งค่า default year, thresholds, document types, announcement, AI model, web search, footer, post-it และ pipeline threshold'],
    ['SMTP', 'ตั้งค่า email sender และส่ง test email']
];

const superadminSections = [
    ['Role Management', 'สร้าง role ต่อ tenant และกำหนด menu permissions โดยรองรับเมนูใหม่ในอนาคต'],
    ['Booking Config', 'ตั้ง Maximum Book / Extra Book และจัดการวันหยุด รวมถึง import holiday announcement'],
    ['Users', 'จัดการ user ภายใน tenant, reset password, role และ tenant role'],
    ['Login Logs', 'ดูประวัติ login พร้อม search/filter/page size และ retention ตาม App Config']
];

const platformSections = [
    ['BSM Dashboard', 'TenantAdmin/TenantUser ดูภาพรวม tenant ทั้งหมด และกดชื่อ team เพื่อเปิด Project Summary ของ tenant นั้น'],
    ['Tenants', 'TenantAdmin สร้าง/แก้ไข/ลบ tenant และ tenant users'],
    ['Platform Users', 'TenantAdmin จัดการ user ระดับ platform']
];

const configNotes = [
    ['Announcement', 'Admin เขียน announcement ด้วย editor, enable/disable, ตั้ง Expired Date หรือเลือก No Expired ได้ ถ้าเลยวันหมดอายุ backend จะ disable ให้อัตโนมัติ'],
    ['AI Model Configuration', 'ตั้ง provider, API key, endpoint/model, load models และ test configuration ใช้ร่วมกับ KB AI Search, Resource AI Suggest และ Pipeline AI Prompt'],
    ['Web Search Configuration', 'ใช้ประกอบ Resource AI Suggest เพื่อค้นแหล่งข้อมูลจาก internet/source provider ก่อนให้ AI แนะนำข้อมูล'],
    ['Project Attachment Document Types', 'เพิ่ม/แก้ category ไฟล์ได้ ลบ category แล้วไฟล์เดิมจะย้ายไป General และ General เป็น fallback ที่ลบ/rename ไม่ได้'],
    ['Footer Text', 'ตั้ง footer ต่อ tenant และแสดงทุกหน้า']
];

function ManualCard({ icon: Icon, title, children }) {
    return (
        <section className="card p-5 space-y-3">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center">
                    <Icon className="w-5 h-5" />
                </div>
                <h2 className="text-lg font-extrabold text-slate-800">{title}</h2>
            </div>
            {children}
        </section>
    );
}

function DefinitionList({ rows }) {
    return (
        <div className="divide-y divide-slate-100">
            {rows.map(([label, text]) => (
                <div key={label} className="grid gap-1 py-3 md:grid-cols-[220px_1fr]">
                    <div className="font-bold text-slate-700">{label}</div>
                    <div className="text-sm leading-relaxed text-slate-600">{text}</div>
                </div>
            ))}
        </div>
    );
}

export default function UserManual() {
    const { user } = useAuth();
    const manualScope = useMemo(() => isPlatformRole(user) ? 'Platform Manual' : 'Tenant Manual', [user]);

    return (
        <div className="mx-auto max-w-6xl space-y-5">
            <div className="rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-white p-6">
                <div className="flex flex-wrap items-start gap-4">
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-white shadow-md"
                         style={{ backgroundImage: 'var(--grad-brand)' }}>
                        <BookOpenIcon className="w-8 h-8" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <h1 className="text-3xl font-extrabold brand-mark">User Manual</h1>
                        <p className="mt-2 text-sm leading-relaxed text-slate-600">
                            คู่มือการใช้งานระบบ BSM Summary / Planning เป็น living manual ที่จะอัปเดตตาม CR และ feature ใหม่ของระบบ
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-slate-500">
                            <span className="pill bg-white text-indigo-700 ring-indigo-200">{manualScope}</span>
                            <span className="pill bg-white text-slate-600 ring-slate-200">Role: {roleLabel(user?.role)}</span>
                            <span className="pill bg-white text-slate-600 ring-slate-200">Last updated: {updatedAt}</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
                <ManualCard icon={BookOpenIcon} title="เริ่มต้นใช้งาน">
                    <DefinitionList rows={quickStart} />
                </ManualCard>

                <ManualCard icon={ChartPieIcon} title="Dashboard และหน้าผู้ใช้ทั่วไป">
                    <DefinitionList rows={dashboardSections} />
                </ManualCard>

                <ManualCard icon={ClipboardDocumentListIcon} title="Administration">
                    <DefinitionList rows={adminSections} />
                </ManualCard>

                <ManualCard icon={ShieldCheckIcon} title="Superadmin และ Platform">
                    <DefinitionList rows={[...superadminSections, ...platformSections]} />
                </ManualCard>

                <ManualCard icon={Cog6ToothIcon} title="Configuration สำคัญ">
                    <DefinitionList rows={configNotes} />
                </ManualCard>

                <ManualCard icon={CalendarDaysIcon} title="Business Rules ที่ควรรู้">
                    <DefinitionList rows={[
                        ['Year Filter', 'Project ที่ไม่มี start/end date จะแสดงทุกปี ส่วน project ที่มีวันจะถูกนับเมื่ออยู่ในปีนั้นหรือคาบเกี่ยวปีที่เลือก'],
                        ['Pipeline Threshold', 'Pipeline จะถูกนับใน revenue/MG เฉพาะเมื่อ % to Win มากกว่า threshold ที่ตั้งใน App Config'],
                        ['Project Code Sync', 'Project Code/ERP Code ของ detail ย่อยยึดตาม Project Code หลัก และ sync เมื่อแก้ project code'],
                        ['Date Shift', 'เมื่อแก้ Main Project Start/End Date ระบบจะเลื่อน start/end date ของ detail ย่อยตามจำนวนวันที่เปลี่ยน'],
                        ['Office Holidays', 'วันหยุดและเสาร์-อาทิตย์ไม่สามารถ booking ได้ วันหยุดที่ import/config จะแสดงบน calendar']
                    ]} />
                </ManualCard>

                <ManualCard icon={SparklesIcon} title="AI Features">
                    <DefinitionList rows={[
                        ['KB AI Search', 'ใช้ AI ขยายคำค้นและค้นจาก content/attachment extracted text เมื่อ AI config พร้อม ถ้า AI fail ระบบ fallback search ปกติ'],
                        ['Pipeline AI Prompt', 'Admin ตั้ง prompt ต่อ field เพื่อช่วยดึง budget value จาก Excel หลัง COST BREAKDOWN และยังแก้ข้อมูลก่อน save ได้'],
                        ['Resource AI Suggest', 'Admin เลือก source/search result แล้วให้ AI แนะนำข้อมูล field ที่ยังว่าง จากนั้น admin confirm ก่อน apply']
                    ]} />
                </ManualCard>

                <ManualCard icon={PaperClipIcon} title="ไฟล์แนบและข้อจำกัด">
                    <DefinitionList rows={[
                        ['Project Attachments', 'Upload ได้หลายไฟล์ จำกัด 50 MB ต่อไฟล์ เลือก/แก้ category ได้ และดูไฟล์จาก Project Management หรือ Project Summary'],
                        ['Preview', 'Preview ได้สำหรับ image และ PDF ส่วนไฟล์อื่นใช้ Download'],
                        ['Knowledge Base Attachments', 'Limit ขนาดไฟล์ KB ตั้งได้ใน KB Configure และรองรับ extracted text สำหรับ search/AI search']
                    ]} />
                </ManualCard>
            </div>
        </div>
    );
}
