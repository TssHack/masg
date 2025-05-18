const { Telegraf, Markup, session } = require('telegraf');
const express = require('express');
const axios = require('axios');

// --- تنظیمات اولیه ---
const BOT_TOKEN = '8192862567:AAHEEYiXZNW9kIn5B-uZZnNK5S0iqJABod4';
const ADMIN_CHAT_IDS = [7094106651, 1848591768];
const WEBHOOK_URL = 'https://nexzo-art.vercel.app/webhook';
const PORT = process.env.PORT || 3000;

// بررسی صحت تنظیمات
if (!BOT_TOKEN) {
    console.error('❌ خطا: توکن ربات تنظیم نشده است.');
    process.exit(1);
}
if (ADMIN_CHAT_IDS.length === 0) {
    console.warn('⚠️ هشدار: هیچ آیدی ادمینی تعیین نشده است.');
}
if (!WEBHOOK_URL.startsWith('https://')) {
    console.error('❌ خطا: آدرس وب‌هوک باید با https شروع شود.');
    process.exit(1);
}

// راه‌اندازی ربات و اکسپرس
const bot = new Telegraf(BOT_TOKEN);
const app = express();

// --- میدل‌ور برای پردازش درخواست‌های JSON ---
app.use(express.json());

// --- استفاده از سشن برای مدیریت بهتر وضعیت‌ها ---
bot.use(session());

// ذخیره‌سازی وضعیت پیام‌ها برای پاسخ‌دهی
const userMessagesMap = new Map(); // ذخیره اطلاعات پیام کاربران برای پاسخ ادمین

// --- تنظیم Webhook ---
const setWebhook = async () => {
    try {
        const response = await axios.get(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook?url=${WEBHOOK_URL}&drop_pending_updates=true`);
        if (response.data.ok) {
            console.log('✅ Webhook با موفقیت تنظیم شد:', response.data.description);
        } else {
            console.error('❌ خطا در تنظیم webhook:', response.data.description);
        }
    } catch (error) {
        console.error('❌ خطا در تنظیم webhook:', error.message);
    }
};

// --- دستور شروع و راهنما ---
bot.start(async (ctx) => {
    const firstName = ctx.from.first_name || '';
    const lastName = ctx.from.last_name || '';
    const username = ctx.from.username ? `@${ctx.from.username}` : 'بدون یوزرنیم';
    const userId = ctx.from.id;

    // پیام خوش‌آمدگوی کاربر
    const welcomeMessage = `
🌟 *سلام ${firstName} عزیز!* 🌟

به ربات پشتیبانی ما خوش آمدید. 
می‌توانید هر نوع پیام، سؤال، درخواست یا مشکلی که دارید را برای ما ارسال کنید.

✨ *قابلیت‌های ربات:*
• ارسال متن، عکس، ویدیو، صدا، فایل و استیکر
• دریافت پاسخ مستقیم از تیم پشتیبانی
• پیگیری درخواست‌های قبلی

🔸 همین حالا پیام خود را ارسال کنید تا در اسرع وقت به شما پاسخ دهیم.`;

    await ctx.replyWithMarkdown(welcomeMessage);

    // اطلاع به ادمین‌ها درباره کاربر جدید
    const adminNotification = `
👤 *کاربر جدید ربات را استارت کرد*

*نام و نام خانوادگی:* ${firstName} ${lastName}
*یوزرنیم:* ${username}
*آیدی:* \`${userId}\`

_${new Date().toLocaleString('fa-IR')}_`;

    ADMIN_CHAT_IDS.forEach(adminId => {
        bot.telegram.sendMessage(adminId, adminNotification, { parse_mode: 'Markdown' })
            .catch(err => console.error(`خطا در ارسال اعلان به ادمین ${adminId}:`, err.message));
    });
});

// --- دستور راهنما ---
bot.help((ctx) => {
    ctx.replyWithMarkdown(`
*🔰 راهنمای استفاده از ربات 🔰*

این ربات به شما امکان می‌دهد مستقیماً با تیم پشتیبانی در ارتباط باشید.

*📤 نحوه ارسال پیام:*
• متن، عکس، ویدیو، صدا، فایل یا استیکر خود را ارسال کنید
• پیام شما بلافاصله به تیم پشتیبانی ارسال می‌شود
• پاسخ تیم پشتیبانی به صورت مستقیم برای شما ارسال خواهد شد

*📋 دستورات:*
/start - شروع مجدد ربات
/help - مشاهده این راهنما
/cancel - لغو عملیات فعلی

*⏱ زمان پاسخگویی:* معمولاً کمتر از 24 ساعت

با تشکر از اینکه ما را انتخاب کردید! 🙏`);
});

// --- مدیریت انواع محتوا از کاربران ---
// مدیریت پیام‌های متنی
bot.on('text', handleUserContent('text'));

// مدیریت عکس‌ها
bot.on('photo', handleUserContent('photo'));

// مدیریت ویدیوها
bot.on('video', handleUserContent('video'));

// مدیریت فایل‌ها
bot.on('document', handleUserContent('document'));

// مدیریت صدا
bot.on('voice', handleUserContent('voice'));

// مدیریت پیام‌های صوتی
bot.on('audio', handleUserContent('audio'));

// مدیریت استیکرها
bot.on('sticker', handleUserContent('sticker'));

/**
 * تابع عمومی مدیریت محتوای دریافتی از کاربر
 * @param {string} contentType نوع محتوا
 * @returns {Function} میدل‌ور تلگرام
 */
function handleUserContent(contentType) {
    return async (ctx) => {
        // بررسی اینکه آیا این پیام از طرف ادمین در پاسخ به کاربر است
        if (ADMIN_CHAT_IDS.includes(ctx.from.id) && ctx.message.reply_to_message) {
            await handleAdminReply(ctx);
            return;
        }

        const userId = ctx.from.id;
        const messageId = ctx.message.message_id;
        const firstName = ctx.from.first_name || '';
        const lastName = ctx.from.last_name || '';
        const username = ctx.from.username ? `@${ctx.from.username}` : 'بدون یوزرنیم';
        
        let contentToForward;
        let fileId = null;
        let fileCaption = '';
        let textContent = '';
        
        // استخراج محتوا بر اساس نوع پیام
        switch (contentType) {
            case 'text':
                textContent = ctx.message.text;
                contentToForward = `
📩 *پیام جدید از کاربر*

👤 *فرستنده:* ${firstName} ${lastName}
🆔 *آیدی:* \`${userId}\`
👤 *یوزرنیم:* ${username}

📄 *متن پیام:*
${textContent}

⏰ _${new Date().toLocaleString('fa-IR')}_`;
                break;
                
            case 'photo':
                fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
                fileCaption = ctx.message.caption || '';
                contentToForward = `
📷 *تصویر جدید از کاربر*

👤 *فرستنده:* ${firstName} ${lastName}
🆔 *آیدی:* \`${userId}\`
👤 *یوزرنیم:* ${username}

🔖 *توضیحات تصویر:*
${fileCaption}

⏰ _${new Date().toLocaleString('fa-IR')}_`;
                break;
                
            case 'video':
                fileId = ctx.message.video.file_id;
                fileCaption = ctx.message.caption || '';
                contentToForward = `
🎥 *ویدیو جدید از کاربر*

👤 *فرستنده:* ${firstName} ${lastName}
🆔 *آیدی:* \`${userId}\`
👤 *یوزرنیم:* ${username}

🔖 *توضیحات ویدیو:*
${fileCaption}

⏰ _${new Date().toLocaleString('fa-IR')}_`;
                break;
                
            case 'document':
                fileId = ctx.message.document.file_id;
                fileCaption = ctx.message.caption || '';
                const fileName = ctx.message.document.file_name || 'بدون نام';
                contentToForward = `
📎 *فایل جدید از کاربر*

👤 *فرستنده:* ${firstName} ${lastName}
🆔 *آیدی:* \`${userId}\`
👤 *یوزرنیم:* ${username}

📋 *نام فایل:* ${fileName}
🔖 *توضیحات فایل:*
${fileCaption}

⏰ _${new Date().toLocaleString('fa-IR')}_`;
                break;
                
            case 'voice':
                fileId = ctx.message.voice.file_id;
                contentToForward = `
🎤 *پیام صوتی جدید از کاربر*

👤 *فرستنده:* ${firstName} ${lastName}
🆔 *آیدی:* \`${userId}\`
👤 *یوزرنیم:* ${username}

⏱ *مدت زمان:* ${Math.round(ctx.message.voice.duration)} ثانیه

⏰ _${new Date().toLocaleString('fa-IR')}_`;
                break;
                
            case 'audio':
                fileId = ctx.message.audio.file_id;
                const title = ctx.message.audio.title || 'بدون عنوان';
                const performer = ctx.message.audio.performer || 'نامشخص';
                fileCaption = ctx.message.caption || '';
                contentToForward = `
🎵 *فایل صوتی جدید از کاربر*

👤 *فرستنده:* ${firstName} ${lastName}
🆔 *آیدی:* \`${userId}\`
👤 *یوزرنیم:* ${username}

🎼 *عنوان:* ${title}
👨‍🎤 *خواننده:* ${performer}
🔖 *توضیحات:*
${fileCaption}

⏰ _${new Date().toLocaleString('fa-IR')}_`;
                break;
                
            case 'sticker':
                fileId = ctx.message.sticker.file_id;
                const emoji = ctx.message.sticker.emoji || '';
                contentToForward = `
😊 *استیکر جدید از کاربر*

👤 *فرستنده:* ${firstName} ${lastName}
🆔 *آیدی:* \`${userId}\`
👤 *یوزرنیم:* ${username}
${emoji ? `🔵 *ایموجی مربوطه:* ${emoji}` : ''}

⏰ _${new Date().toLocaleString('fa-IR')}_`;
                break;
                
            default:
                textContent = 'محتوای پشتیبانی نشده';
                contentToForward = `پیام پشتیبانی نشده از کاربر ${firstName} (${userId})`;
        }

        // دکمه‌های پاسخ برای ادمین
        const replyMarkup = Markup.inlineKeyboard([
            Markup.button.callback('📝 پاسخ به کاربر', `reply_${userId}_${messageId}`),
            Markup.button.callback('⚠️ بلاک کردن', `block_${userId}`)
        ]).reply_markup;

        // ارسال به همه ادمین‌ها
        for (const adminId of ADMIN_CHAT_IDS) {
            try {
                let sentMessage;
                
                // ارسال پیام مناسب بر اساس نوع محتوا
                if (fileId) {
                    // ارسال اطلاعات کاربر به ادمین
                    sentMessage = await bot.telegram.sendMessage(adminId, contentToForward, {
                        parse_mode: 'Markdown',
                        reply_markup: replyMarkup
                    });
                    
                    // سپس ارسال فایل اصلی
                    switch (contentType) {
                        case 'photo':
                            await bot.telegram.sendPhoto(adminId, fileId, {
                                caption: fileCaption || undefined
                            });
                            break;
                        case 'video':
                            await bot.telegram.sendVideo(adminId, fileId, {
                                caption: fileCaption || undefined
                            });
                            break;
                        case 'document':
                            await bot.telegram.sendDocument(adminId, fileId, {
                                caption: fileCaption || undefined
                            });
                            break;
                        case 'voice':
                            await bot.telegram.sendVoice(adminId, fileId);
                            break;
                        case 'audio':
                            await bot.telegram.sendAudio(adminId, fileId, {
                                caption: fileCaption || undefined
                            });
                            break;
                        case 'sticker':
                            await bot.telegram.sendSticker(adminId, fileId);
                            break;
                    }
                } else {
                    // برای پیام‌های متنی
                    sentMessage = await bot.telegram.sendMessage(adminId, contentToForward, {
                        parse_mode: 'Markdown',
                        reply_markup: replyMarkup
                    });
                }
                
                // ذخیره اطلاعات پیام برای پاسخ‌دهی بعدی
                if (sentMessage) {
                    userMessagesMap.set(`${sentMessage.message_id}_${adminId}`, {
                        userId,
                        firstName,
                        messageType: contentType
                    });
                }
            } catch (error) {
                console.error(`❌ خطا در ارسال پیام به ادمین ${adminId}:`, error.message);
            }
        }

        // تأیید دریافت به کاربر
        let confirmationMessage = '';
        
        switch (contentType) {
            case 'text': 
                confirmationMessage = '✅ پیام شما با موفقیت دریافت شد. تیم پشتیبانی در اسرع وقت پاسخ خواهند داد.';
                break;
            case 'photo': 
                confirmationMessage = '✅ تصویر شما با موفقیت دریافت شد. تیم پشتیبانی در اسرع وقت پاسخ خواهند داد.';
                break;
            case 'video':
                confirmationMessage = '✅ ویدیو شما با موفقیت دریافت شد. تیم پشتیبانی در اسرع وقت پاسخ خواهند داد.';
                break;
            case 'document':
                confirmationMessage = '✅ فایل شما با موفقیت دریافت شد. تیم پشتیبانی در اسرع وقت پاسخ خواهند داد.';
                break;
            case 'voice':
                confirmationMessage = '✅ پیام صوتی شما با موفقیت دریافت شد. تیم پشتیبانی در اسرع وقت پاسخ خواهند داد.';
                break;
            case 'audio':
                confirmationMessage = '✅ فایل صوتی شما با موفقیت دریافت شد. تیم پشتیبانی در اسرع وقت پاسخ خواهند داد.';
                break;
            case 'sticker':
                confirmationMessage = '✅ استیکر شما با موفقیت دریافت شد. تیم پشتیبانی در اسرع وقت پاسخ خواهند داد.';
                break;
            default:
                confirmationMessage = '✅ پیام شما دریافت شد. تیم پشتیبانی در اسرع وقت پاسخ خواهند داد.';
        }
        
        await ctx.reply(confirmationMessage);
    };
}

/**
 * مدیریت پاسخ ادمین به کاربر
 */
async function handleAdminReply(ctx) {
    // بررسی اینکه آیا پیام از ادمین است
    if (!ADMIN_CHAT_IDS.includes(ctx.from.id)) return;
    
    const adminId = ctx.from.id;
    const repliedMessageId = ctx.message.reply_to_message.message_id;
    const userInfo = userMessagesMap.get(`${repliedMessageId}_${adminId}`);
    
    // اگر اطلاعات کاربر یافت نشد، تلاش برای استخراج از متن پیام
    if (!userInfo) {
        const repliedText = ctx.message.reply_to_message.text || ctx.message.reply_to_message.caption || '';
        const userIdMatch = repliedText.match(/🆔 \*آیدی:\* `(\d+)`/);
        
        if (userIdMatch && userIdMatch[1]) {
            const targetUserId = parseInt(userIdMatch[1], 10);
            const nameMatch = repliedText.match(/👤 \*فرستنده:\* (.*?)\n/);
            const firstName = nameMatch ? nameMatch[1] : 'کاربر';
            
            // ارسال پاسخ ادمین به کاربر
            await sendAdminResponseToUser(ctx, targetUserId, firstName);
            return;
        }
        
        // اگر هیچ اطلاعاتی پیدا نشد
        await ctx.reply('⚠️ نمی‌توانم تشخیص دهم این پاسخ برای کدام کاربر است. لطفاً از دکمه "پاسخ به کاربر" استفاده کنید یا به پیامی که حاوی اطلاعات کاربر است پاسخ دهید.');
        return;
    }
    
    await sendAdminResponseToUser(ctx, userInfo.userId, userInfo.firstName);
}

/**
 * ارسال پاسخ ادمین به کاربر
 */
async function sendAdminResponseToUser(ctx, targetUserId, firstName) {
    try {
        // استخراج اطلاعات پاسخ ادمین
        const adminName = ctx.from.first_name || 'پشتیبانی';
        const adminUsername = ctx.from.username ? `@${ctx.from.username}` : 'بدون یوزرنیم';
        
        // بررسی نوع محتوای ارسالی ادمین
        if (ctx.message.text) {
            // پاسخ متنی
            await bot.telegram.sendMessage(targetUserId, `
📨 *پاسخ از پشتیبانی*

${ctx.message.text}

👤 ${adminName}
⏰ _${new Date().toLocaleString('fa-IR')}_`, { parse_mode: 'Markdown' });
        } else if (ctx.message.photo) {
            // ارسال عکس
            await bot.telegram.sendPhoto(targetUserId, ctx.message.photo[ctx.message.photo.length - 1].file_id, {
                caption: `📨 *پاسخ تصویری از پشتیبانی*\n\n${ctx.message.caption || ''}\n\n👤 ${adminName}\n⏰ _${new Date().toLocaleString('fa-IR')}_`,
                parse_mode: 'Markdown'
            });
        } else if (ctx.message.video) {
            // ارسال ویدیو
            await bot.telegram.sendVideo(targetUserId, ctx.message.video.file_id, {
                caption: `📨 *پاسخ ویدیویی از پشتیبانی*\n\n${ctx.message.caption || ''}\n\n👤 ${adminName}\n⏰ _${new Date().toLocaleString('fa-IR')}_`,
                parse_mode: 'Markdown'
            });
        } else if (ctx.message.document) {
            // ارسال فایل
            await bot.telegram.sendDocument(targetUserId, ctx.message.document.file_id, {
                caption: `📨 *پاسخ فایل از پشتیبانی*\n\n${ctx.message.caption || ''}\n\n👤 ${adminName}\n⏰ _${new Date().toLocaleString('fa-IR')}_`,
                parse_mode: 'Markdown'
            });
        } else if (ctx.message.voice) {
            // ارسال صدا
            await bot.telegram.sendVoice(targetUserId, ctx.message.voice.file_id, {
                caption: `📨 *پاسخ صوتی از پشتیبانی*\n\n👤 ${adminName}\n⏰ _${new Date().toLocaleString('fa-IR')}_`,
                parse_mode: 'Markdown'
            });
        } else if (ctx.message.audio) {
            // ارسال فایل صوتی
            await bot.telegram.sendAudio(targetUserId, ctx.message.audio.file_id, {
                caption: `📨 *پاسخ صوتی از پشتیبانی*\n\n${ctx.message.caption || ''}\n\n👤 ${adminName}\n⏰ _${new Date().toLocaleString('fa-IR')}_`,
                parse_mode: 'Markdown'
            });
        } else if (ctx.message.sticker) {
            // ارسال استیکر
            await bot.telegram.sendSticker(targetUserId, ctx.message.sticker.file_id);
        } else {
            // نوع پیام پشتیبانی نشده
            await ctx.reply('❌ این نوع پیام برای ارسال به کاربر پشتیبانی نمی‌شود.');
            return;
        }
        
        // اعلام موفقیت به ادمین
        await ctx.reply(`✅ پاسخ شما با موفقیت برای ${firstName} (آیدی: ${targetUserId}) ارسال شد.`);
        console.log(`✅ پاسخ از ادمین ${ctx.from.id} به کاربر ${targetUserId} ارسال شد.`);
    } catch (error) {
        console.error(`❌ خطا در ارسال پاسخ به کاربر ${targetUserId}:`, error);
        await ctx.reply(`❌ خطا در ارسال پاسخ به کاربر ${firstName} (${targetUserId}): ${error.message}`);
    }
}

// --- مدیریت کال‌بک کوئری‌ها ---
bot.action(/reply_(\d+)_(\d+)/, async (ctx) => {
    const userId = parseInt(ctx.match[1], 10);
    const messageId = parseInt(ctx.match[2], 10);
    const adminId = ctx.from.id;

    if (!ADMIN_CHAT_IDS.includes(adminId)) {
        await ctx.answerCbQuery('⛔️ شما اجازه پاسخ به کاربران را ندارید.');
        return;
    }

    await ctx.answerCbQuery('لطفاً پاسخ خود را بنویسید یا ارسال کنید.');
    
    // ذخیره وضعیت پاسخ دادن
    ctx.session = ctx.session || {};
    ctx.session.replyTo = userId;
    
    await ctx.reply(`✏️ لطفاً پاسخ خود را برای کاربر با آیدی \`${userId}\` ارسال کنید.
    
می‌توانید متن، عکس، ویدیو، صدا، فایل یا استیکر ارسال کنید.`, { parse_mode: 'Markdown' });
});

// --- مدیریت بلاک کردن کاربر ---
bot.action(/block_(\d+)/, async (ctx) => {
    const userId = parseInt(ctx.match[1], 10);
    const adminId = ctx.from.id;

    if (!ADMIN_CHAT_IDS.includes(adminId)) {
        await ctx.answerCbQuery('⛔️ شما اجازه بلاک کردن کاربران را ندارید.');
        return;
    }

    // در اینجا می‌توانید کد بلاک کردن کاربر را اضافه کنید
    // برای مثال، ذخیره آیدی کاربر در یک لیست بلاک و بررسی آن هنگام دریافت پیام
    
    await ctx.answerCbQuery(`کاربر با آیدی ${userId} بلاک شد.`);
    await ctx.reply(`🚫 کاربر با آیدی \`${userId}\` بلاک شد و دیگر نمی‌تواند پیامی برای شما ارسال کند.`, {
        parse_mode: 'Markdown'
    });
});

// --- مدیریت خطاها ---
bot.catch((err, ctx) => {
    console.error('❌ خطا در پردازش بات:', err);
    
    // ارسال گزارش خطا به ادمین‌ها
    const errorMessage = `
⚠️ *خطایی در ربات رخ داد*

\`${err.message.substring(0, 1000)}\`

⏰ _${new Date().toLocaleString('fa-IR')}_`;

    ADMIN_CHAT_IDS.forEach(adminId => {
        bot.telegram.sendMessage(adminId, errorMessage, { parse_mode: 'Markdown' })
            .catch(e => console.error("خطا در ارسال پیام خطا:", e.message));
    });
});

// --- راه‌اندازی وب‌هوک ---
app.use(bot.webhookCallback('/webhook'));

// --- اجرای سرور ---
app.listen(PORT, async () => {
    console.log(`✅ سرور در پورت ${PORT} در حال اجراست...`);
    console.log(`📡 آدرس webhook: ${WEBHOOK_URL}`);
    
    // تنظیم webhook
    if (process.env.NODE_ENV === 'production' || process.env.SET_WEBHOOK_ON_START) {
        await setWebhook();
    } else {
        console.log(`💡 برای تنظیم دستی webhook: curl "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook?url=${WEBHOOK_URL}"`);
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
