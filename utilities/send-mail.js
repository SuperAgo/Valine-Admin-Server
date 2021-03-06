"use strict";
const nodemailer = require("nodemailer");
const ejs = require("ejs");
const fs = require("fs");
const path = require("path");
const axios = require("axios");

const config = {
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
};

if (process.env.SMTP_SERVICE != null) {
  config.service = process.env.SMTP_SERVICE;
} else {
  config.host = process.env.SMTP_HOST;
  config.port = parseInt(process.env.SMTP_PORT);
  config.secure = process.env.SMTP_SECURE !== "false";
}

const transporter = nodemailer.createTransport(config);
const templateName = process.env.TEMPLATE_NAME
  ? process.env.TEMPLATE_NAME
  : "rainbow";
const noticeTemplate = ejs.compile(
  fs.readFileSync(
    path.resolve(process.cwd(), "template", templateName, "notice.ejs"),
    "utf8"
  )
);
const sendTemplate = ejs.compile(
  fs.readFileSync(
    path.resolve(process.cwd(), "template", templateName, "send.ejs"),
    "utf8"
  )
);

// 提醒站长
exports.notice = (comment) => {
  // 站长自己发的评论不需要通知
  if (
    comment.get("mail") === process.env.TO_EMAIL ||
    comment.get("mail") === process.env.BLOGGER_EMAIL ||
    comment.get("mail") === process.env.SMTP_USER
  ) {
    return;
  }

  const name = comment.get("nick");
  const text = comment.get("comment");
  const url = process.env.SITE_URL + comment.get("url");
  const comment_id = process.env.COMMENT ? process.env.COMMENT : "";
  const emailSubject =
    "📌 哇！「" + process.env.SITE_NAME + "」上有人回复了你啦！快点我！💦";
  const emailContent = noticeTemplate({
    siteName: process.env.SITE_NAME,
    siteUrl: process.env.SITE_URL,
    name: name,
    text: text,
    url: url + comment_id,
    mail: comment.get("mail"),
  });

  const mailOptions = {
    from: '"' + process.env.SENDER_NAME + '" <' + process.env.SMTP_USER + ">",
    to:
      process.env.TO_EMAIL ||
      process.env.BLOGGER_EMAIL ||
      process.env.SMTP_USER,
    subject: emailSubject,
    html: emailContent,
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      return console.log(error);
    }
    comment.set("isNotified", true);
    comment.save();
    console.log("收到一条评论, 已邮件提醒站长");
  });
  // 微信提醒
  const scContent =
    "#### 评论内容" +
    "\r\n > " +
    comment.get("comment") +
    "\r\n" +
    "原文地址 👉 " +
    process.env.SITE_URL +
    comment.get("url") +
    "\r\n #### 评论人\r\n" +
    comment.get("nick") +
    "(" +
    comment.get("mail") +
    ")";
  if (process.env.SCKEY != null) {
    axios({
      method: "post",
      url: `https://sc.ftqq.com/${process.env.SCKEY}.send`,
      data: `text=${process.env.SITE_NAME} 来新评论啦！&desp=${scContent}`,
      headers: {
        "Content-type": "application/x-www-form-urlencoded",
      },
    })
      .then(function (response) {
        if (response.status === 200 && response.data.errmsg === "success")
          console.log("已微信提醒站长");
        else console.log("微信提醒失败:", response.data);
      })
      .catch(function (error) {
        console.log("微信提醒失败:", error);
      });
  }
  // qq提醒
  const qContent =
    "嘿！你的网站： " +
    process.env.SITE_NAME +
    "  收到新评论啦！" +
    "\n\r" +
    "评论内容如下：\n\r" +
    comment.get("comment") +
    "\n\r评论者昵称：" +
    comment.get("nick") +
    "（" +
    comment.get("mail") +
    "）\n\r原文地址 👉 " +
    process.env.SITE_URL +
    comment.get("url");
  if (process.env.QMSG != null) {
    let qq = "";
    if (process.env.QQ != null) {
      qq = "&qq=" + process.env.QQ;
    }
    axios({
      method: "post",
      url: `https://qmsg.zendee.cn:443/send/${process.env.QMSG}.html`,
      data: `msg=${qContent}` + qq,
      headers: {
        "Content-type": "application/x-www-form-urlencoded",
      },
    })
      .then(function (response) {
        if (response.status === 200 && response.data.success === true)
          console.log("已QQ提醒站长", qq);
        else console.log("QQ提醒失败:", response.data);
      })
      .catch(function (error) {
        console.log("QQ提醒回馈:", error);
      });
  }
};

// 发送邮件通知他人
exports.send = (currentComment, parentComment) => {
  // 站长被 @ 不需要提醒
  if (
    parentComment.get("mail") === process.env.TO_EMAIL ||
    parentComment.get("mail") === process.env.BLOGGER_EMAIL ||
    parentComment.get("mail") === process.env.SMTP_USER
  ) {
    return;
  }
  const emailSubject =
    "📌 哇！「" + process.env.SITE_NAME + "」上有人回复了你啦！快点我！💦";
  const emailContent = sendTemplate({
    siteName: process.env.SITE_NAME,
    siteUrl: process.env.SITE_URL,
    pname: parentComment.get("nick"),
    ptext: parentComment.get("comment"),
    name: currentComment.get("nick"),
    text: currentComment.get("comment"),
    url:
      process.env.SITE_URL +
      currentComment.get("url") +
      "#" +
      currentComment.get("pid"),
  });
  const mailOptions = {
    from: '"' + process.env.SENDER_NAME + '" <' + process.env.SMTP_USER + ">",
    to: parentComment.get("mail"),
    subject: emailSubject,
    html: emailContent,
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      return console.log(error);
    }
    currentComment.set("isNotified", true);
    currentComment.save();
    console.log(
      currentComment.get("nick") +
        " @了" +
        parentComment.get("nick") +
        ", 已通知."
    );
  });
};

// 该方法可验证 SMTP 是否配置正确
exports.verify = function () {
  console.log("....");
  transporter.verify(function (error, success) {
    if (error) {
      console.log(error);
    }
    console.log("Server is ready to take our messages");
  });
};
