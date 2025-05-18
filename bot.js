const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const axios = require('axios'); // اگر مستقیماً از API تلگرام استفاده می‌کنید

// --- تنظیمات اولیه ---
const BOT_TOKEN = '8192862567:AAHEEYiXZNW9kIn5B-uZZnNK5S0iqJABod4'; // توکن ربات خود را اینجا قرار دهید
const ADMIN_CHAT_IDS = [7094106651, 1848591768]; // آیدی عددی ادمین‌ها
const WEBHOOK_URL = 'https://nexzo-art.vercel.app/webhook'; // آدرس وب‌هوک شما (باید HTTPS باشد)
const PORT = process.env.PORT || 3000;

if (!BOT_TOKEN) {
    console.error('خطا: توکن ربات تنظیم نشده است. لطفا متغیر BOT_TOKEN را مقداردهی کنید.');
    process.exit(1);
}
if (ADMIN_CHAT_IDS.length === 0) {
    console.warn('هشدار: هیچ آیدی ادمینی تنظیم نشده است. ارسال پیام به ادمین‌ها کار نخواهد کرد.');
}
if (!WEBHOOK_URL.startsWith('https://')) {
    console.error('خطا: آدرس وب‌هوک باید با https شروع شود.');
    process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);
const app = express();

// --- Middleware برای解析 JSON ---
app.use(express.json());

// --- نگهداری وضعیت برای پاسخ ادمین ---
// در یک محیط واقعی، بهتر است از یک دیتابیس (مانند Redis یا PostgreSQL) برای این منظور استفاده شود.
// این یک راه‌حل ساده برای نمایش عملکرد است.
const userMessagesForAdmins = new Map(); // Key: message_id_in_admin_chat, Value: original_user_chat_id

// --- تنظیم Webhook ---
// این تابع را یک بار پس از اجرای سرور و اطمینان از در دسترس بودن WEBHOOK_URL اجرا کنید.
// یا به صورت خودکار در شروع برنامه (پس از آماده شدن سرور)
const setWebhook = async () => {
    try {
        const response = await axios.get(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook?url=${WEBHOOK_URL}`);
        if (response.data.ok) {
            console.log('Webhook با موفقیت تنظیم شد:', response.data.description);
        } else {
            console.error('خطا در تنظیم Webhook:', response.data.description);
        }
    } catch (error) {
        console.error('خطا در ارسال درخواست تنظیم Webhook:', error.message);
    }
};

// --- مدیریت دستور /start ---
bot.start(async (ctx) => {
    const firstName = ctx.from.first_name || '';
    const lastName = ctx.from.last_name || '';
    const username = ctx.from.username ? `@${ctx.from.username}` : 'ندارد';
    const userId = ctx.from.id;

    const welcomeMessage = `سلام ${firstName} ${lastName}! 👋\nپیام خود را برای ارسال به ادمین‌ها بنویسید.`;
    await ctx.reply(welcomeMessage);

    // اطلاع به ادمین‌ها که کاربر جدیدی ربات را استارت زده است (اختیاری)
    const adminNotification = `کاربر جدید ربات را استارت زد:\n\nنام: ${firstName} ${lastName}\nیوزرنیم: ${username}\nآیدی عددی: ${userId}`;
    ADMIN_CHAT_IDS.forEach(adminId => {
        bot.telegram.sendMessage(adminId, adminNotification).catch(err => console.error(`خطا در ارسال پیام به ادمین ${adminId}:`, err));
    });
});

// --- مدیریت پیام‌های متنی کاربران ---
bot.on('text', async (ctx) => {
    // جلوگیری از پردازش پیام‌هایی که از طرف ادمین‌ها در پاسخ به پیام کاربر ارسال می‌شوند
    if (ADMIN_CHAT_IDS.includes(ctx.message.from.id) && ctx.message.reply_to_message) {
        // این بخش مربوط به پاسخ ادمین است و در ادامه مدیریت می‌شود
        return;
    }

    const userMessage = ctx.message.text;
    const firstName = ctx.from.first_name || '';
    const lastName = ctx.from.last_name || '';
    const username = ctx.from.username ? `@${ctx.from.username}` : 'ندارد';
    const userId = ctx.from.id;

    const messageToAdmin = `پیام جدید از کاربر:\n\n👤 **کاربر:** ${firstName} ${lastName}\n🆔 **آیدی:** \`${userId}\`\n💬 **یوزرنیم:** ${username}\n\n📝 **متن پیام:**\n${userMessage}`;

    // ارسال پیام به همه ادمین‌ها
    for (const adminId of ADMIN_CHAT_IDS) {
        try {
            const sentMessage = await bot.telegram.sendMessage(adminId, messageToAdmin, {
                parse_mode: 'Markdown',
                reply_markup: Markup.inlineKeyboard([
                    Markup.button.callback('پاسخ به این کاربر', `reply_to_${userId}_${ctx.message.message_id}`)
                ]).reply_markup
            });
            // ذخیره اطلاعات برای امکان پاسخ از طرف ادمین
            // کلید می‌تواند شناسه پیام در چت ادمین باشد تا بتوان پاسخ را به آن مرتبط کرد
            // اما برای سادگی، اینجا از شناسه پیام اصلی کاربر استفاده می‌کنیم (که شاید بهترین روش نباشد)
            // بهتر است یک شناسه یکتا برای هر "مورد" (تیکت) ایجاد شود.
            // در اینجا، فرض می‌کنیم پاسخ ادمین به پیام فوروارد شده کاربر خواهد بود.
        } catch (error) {
            console.error(`خطا در ارسال پیام به ادمین ${adminId}:`, error);
            // می‌توانید به کاربر اطلاع دهید که در ارسال پیام به ادمین مشکلی پیش آمده است
            // ctx.reply('متاسفانه در حال حاضر امکان ارسال پیام شما به ادمین وجود ندارد. لطفا بعدا تلاش کنید.');
        }
    }

    await ctx.reply('پیام شما با موفقیت برای ادمین‌ها ارسال شد. منتظر پاسخ بمانید.');
});

// --- مدیریت پاسخ ادمین‌ها ---
// این بخش کمی پیچیده‌تر است زیرا باید بدانیم ادمین به کدام پیام کاربر پاسخ می‌دهد.
// یک راه رایج، استفاده از دکمه inline و callback query است.
// روش دیگر این است که ادمین به پیام فوروارد شده از کاربر "Reply" کند.

bot.on('message', async (ctx) => {
    // بررسی اینکه آیا پیام از طرف یکی از ادمین‌ها است
    if (!ADMIN_CHAT_IDS.includes(ctx.message.from.id)) {
        return; // پیام از کاربر عادی است و در بخش قبلی (bot.on('text')) پردازش شده
    }

    // بررسی اینکه آیا ادمین در حال "پاسخ دادن" (Reply) به پیامی است
    if (ctx.message.reply_to_message) {
        const repliedToMessage = ctx.message.reply_to_message;
        const adminReplyText = ctx.message.text; // پیام ادمین

        // حالا باید بفهمیم این پیامی که ادمین به آن ریپلای کرده، مربوط به کدام کاربر است.
        // این قسمت نیازمند منطق دقیق‌تری است.
        // اگر پیام اصلی کاربر به ادمین فوروارد شده و ادمین به آن ریپلای می‌کند،
        // می‌توانیم از `repliedToMessage.forward_from` اطلاعات کاربر اصلی را استخراج کنیم.

        let originalUserId;
        let originalUserFirstName = 'کاربر';

        // سناریو ۱: ادمین به پیامی ریپلای کرده که حاوی اطلاعات کاربر در متن آن است (که ما ارسال کردیم)
        if (repliedToMessage.text && repliedToMessage.text.includes('🆔 **آیدی:** `')) {
            const match = repliedToMessage.text.match(/🆔 \*\*آیدی:\*\* `(\d+)`/);
            if (match && match[1]) {
                originalUserId = parseInt(match[1], 10);
            }
            const nameMatch = repliedToMessage.text.match(/👤 \*\*کاربر:\*\* (.*?)\n/);
            if (nameMatch && nameMatch[1]) {
                originalUserFirstName = nameMatch[1];
            }
        }
        // سناریو ۲ (بهتر): اگر پیام مستقیماً از کاربر به ادمین فوروارد شده بود (بدون تغییر توسط ربات)
        else if (repliedToMessage.forward_from) {
            originalUserId = repliedToMessage.forward_from.id;
            originalUserFirstName = repliedToMessage.forward_from.first_name || 'کاربر';
        }
        // سناریو ۳: استفاده از Callback Query (که در اینجا پیاده‌سازی نشده ولی روش بهتری است)
        // در این حالت، از userMessagesForAdmins که قبلا تعریف شد استفاده می‌کنیم.
        // فرض کنیم کلید Map، آیدی پیامی است که دکمه "پاسخ" زیر آن بوده.
        // const originalUserInfo = userMessagesForAdmins.get(repliedToMessage.message_id);
        // if (originalUserInfo) {
        //     originalUserId = originalUserInfo.userId;
        //     originalUserFirstName = originalUserInfo.firstName;
        // }

        if (originalUserId && adminReplyText) {
            try {
                await bot.telegram.sendMessage(originalUserId, `پاسخ از ادمین:\n\n${adminReplyText}`);
                await ctx.reply('پاسخ شما با موفقیت برای کاربر ارسال شد.');
                console.log(`پاسخ از ادمین ${ctx.message.from.id} به کاربر ${originalUserId} ارسال شد.`);
            } catch (error) {
                console.error(`خطا در ارسال پاسخ به کاربر ${originalUserId}:`, error);
                await ctx.reply('خطا در ارسال پاسخ به کاربر. جزئیات در لاگ سرور موجود است.');
            }
        } else if (adminReplyText) { // اگر ادمین پیامی ارسال کرده که ریپلای نیست یا اطلاعات کاربر یافت نشد
            // این پیام ادمین به عنوان یک پیام عادی در نظر گرفته می‌شود و نباید به کاربر ارسال شود.
            // یا می‌توانیم به ادمین اطلاع دهیم که برای پاسخ باید از گزینه Reply استفاده کند.
            // console.log('پیام ادمین بدون ریپلای مشخص یا اطلاعات کاربر دریافت شد.');
            // await ctx.reply('برای پاسخ به کاربر، لطفا روی پیام کاربر "Reply" کنید و سپس پیام خود را بنویسید.');
        }
    } else if (ADMIN_CHAT_IDS.includes(ctx.message.from.id) && ctx.message.text && !ctx.message.text.startsWith('/')) {
        // اگر ادمین پیامی ارسال کرد که ریپلای نیست و دستور هم نیست، به او تذکر داده شود.
        // ctx.reply('برای ارسال پیام به کاربر، لطفاً به پیام ارسال شده از طرف کاربر "Reply" کنید یا از دستورات مربوطه استفاده نمایید.');
    }
});


// --- مدیریت Callback Query ها (برای دکمه "پاسخ به این کاربر") ---
// این یک روش بهتر برای مدیریت پاسخ ادمین است.
bot.action(/reply_to_(\d+)_(\d+)/, async (ctx) => {
    const targetUserId = parseInt(ctx.match[1], 10);
    const originalUserMessageId = parseInt(ctx.match[2], 10); // آیدی پیام اصلی کاربر (برای ارجاع)

    const adminId = ctx.from.id;

    // به ادمین پیام می‌دهیم که اکنون می‌تواند پاسخ خود را ارسال کند.
    // و این پاسخ باید به نحوی به کاربر مورد نظر مرتبط شود.
    // یک راه این است که از ادمین بخواهیم در پیام بعدی خود پاسخ را وارد کند.
    // و ما منتظر پیام بعدی از این ادمین برای این کاربر باشیم.

    // ذخیره وضعیت: ادمین X می‌خواهد به کاربر Y پاسخ دهد.
    // این روش ساده است و در صورتی که ادمین همزمان به چند نفر بخواهد پاسخ دهد، دچار مشکل می‌شود.
    // راه حل بهتر: استفاده از Telegraf Scenes یا یک state manager خارجی.
    // For simplicity, we'll just inform the admin.
    // A more robust solution would involve scenes or a dedicated state management.

    await ctx.answerCbQuery('در پیام بعدی، پاسخ خود را برای این کاربر ارسال کنید.');
    await ctx.reply(`لطفا پاسخ خود را برای کاربر با آیدی \`${targetUserId}\` (مربوط به پیام با شناسه ${originalUserMessageId}) ارسال کنید. پیام شما مستقیما به او ارسال خواهد شد.`);

    // تنظیم یک شنونده موقت برای پیام بعدی این ادمین
    // این روش ساده است و محدودیت‌هایی دارد (مثلاً اگر ادمین پیام دیگری بفرستد)
    // استفاده از `bot.hears` یا `bot.on('text')` با یک فلگ یا وضعیت خاص برای ادمین بهتر است.

    // یک راه‌حل ساده‌تر: ادمین باید به پیامی که دکمه زیر آن بوده "Reply" کند.
    // و ما در `bot.on('message')` آن را مدیریت کنیم.
    // این دکمه بیشتر برای شناسایی کاربر و پیام است.

    // در پیاده‌سازی فعلی `bot.on('message')`، انتظار داریم ادمین به پیام اصلی ربات (که حاوی اطلاعات کاربر است) reply کند.
    // این دکمه callback بیشتر جنبه راهنمایی دارد یا می‌تواند برای آماده‌سازی‌های دیگر استفاده شود.
});


// --- مدیریت خطاهای Telegraf ---
bot.catch((err, ctx) => {
    console.error(`خطا در پردازش آپدیت ${ctx.updateType}:`, err);
    // ارسال پیام خطا به ادمین‌ها (اختیاری و با احتیاط برای جلوگیری از حلقه خطا)
    const errorMessage = `متاسفانه یک خطا در ربات رخ داده است:\n\`${err.message}\`\n\nUpdate Type: ${ctx.updateType}\nUpdate: \`${JSON.stringify(ctx.update, null, 2)}\``;
    ADMIN_CHAT_IDS.forEach(adminId => {
        // اطمینان از اینکه پیام خطا خیلی طولانی نباشد
        bot.telegram.sendMessage(adminId, errorMessage.substring(0, 4090)).catch(e => console.error("خطا در ارسال پیام خطا به ادمین:", e));
    });
});


// --- راه‌اندازی سرور Express برای Webhook ---
// مسیر Webhook باید با آنچه در تلگرام تنظیم می‌کنید یکی باشد.
app.use(bot.webhookCallback('/webhook')); // telegraf middleware

// --- اجرای سرور ---
app.listen(PORT, async () => {
    console.log(`سرور در پورت ${PORT} در حال اجرا است...`);
    console.log(`برای تنظیم Webhook، آدرس زیر را به تلگرام بدهید (یک بار کافی است):`);
    console.log(`${WEBHOOK_URL}`);
    console.log(`برای تست، می‌توانید از دستور زیر در مرورگر یا ترمینال استفاده کنید (پس از اجرای ngrok اگر لوکال هستید):`);
    console.log(`curl "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook?url=${WEBHOOK_URL}"`);

    // --- تنظیم Webhook پس از راه‌اندازی سرور ---
    // این کار را فقط یک بار یا زمانی که URL وب‌هوک تغییر می‌کند انجام دهید.
    // در محیط پروداکشن، ممکن است بخواهید این را به صورت دستی یا از طریق اسکریپت دیگری مدیریت کنید.
    if (process.env.NODE_ENV === 'production' || process.env.SET_WEBHOOK_ON_START) { // فقط در پروداکشن یا با فلگ خاص
         await setWebhook();
    } else {
         console.warn("توجه: Webhook به صورت خودکار تنظیم نشد. اگر اولین بار است یا URL تغییر کرده، آن را دستی تنظیم کنید.");
         console.warn(`می‌توانید URL زیر را در مرورگر خود باز کنید یا از cURL استفاده کنید:`);
         console.warn(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook?url=${WEBHOOK_URL}&drop_pending_updates=true`);
    }
});

// --- اطمینان از خاموش شدن درست ربات ---
process.once('SIGINT', () => {
    console.log("در حال خاموش کردن ربات (SIGINT)...");
    bot.stop('SIGINT');
    // اگر از دیتابیس یا منابع دیگری استفاده می‌کنید، اینجا آن‌ها را ببندید.
    process.exit(0);
});
process.once('SIGTERM', () => {
    console.log("در حال خاموش کردن ربات (SIGTERM)...");
    bot.stop('SIGTERM');
    process.exit(0);
});
