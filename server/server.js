require("dotenv").config()
const express = require("express")
const app = express()

const PORT = process.env.PORT

app.get("/", (req,res)=>{
  res.send("OK")
})

app.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on port", PORT)
})


const mysql = require("mysql2/promise")
const cors = require("cors")
const cron = require("node-cron")
const twilio = require("twilio")

app.use(cors())
app.use(express.json())

const db = mysql.createPool({
  host: process.env.MYSQLHOST,
  user: process.env.MYSQLUSER,
  password: process.env.MYSQLPASSWORD,
  database: process.env.MYSQLDATABASE,
  port: Number(process.env.MYSQLPORT),
  ssl: process.env.NODE_ENV === "production"
    ? { rejectUnauthorized: false }
    : false
});


const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
)

const sendWhatsApp = async (phone, text) => {
  try {
    await client.messages.create({
      from: process.env.TWILIO_WHATSAPP_NUMBER,
      to: `whatsapp:${phone}`,
      body: text,
    })
  } catch (error) {
    console.log("Twilio Error:", error.message)
  }
}

// CREATE BILL API

app.post('/bills', async (request, response) => {

  const {title, amount, due_day, reminder_time, phone} = request.body

  let createBillQuery = `
    INSERT INTO bills
    (title, amount, due_day, reminder_time, phone, message)
    VALUES (
      '${title}',
      '${amount}',
      '${due_day}',
      '${reminder_time}',
      '${phone}',
      'EMI Reminder'
    );
  `

  try {
    await db.execute(createBillQuery)
    response.status(200).send('Bill created successfully')
  } catch {
    response.status(500).send('Error creating bill')
  }
})

// GET BILL API

app.get('/bills', async (request, response) => {

  let getBillsQuery = `
    SELECT * FROM bills
    ORDER BY due_day ASC;
  `

  try {
    let [billsList] = await db.execute(getBillsQuery)
    response.status(200).send(billsList)
  } catch {
    response.status(500).send('Error fetching bills')
  }
})

// UPDATE BILL API

app.put('/bills/:id', async (request, response) => {

  const {id} = request.params
  const {title, amount, due_day, reminder_time, phone, message} = request.body

  let updateBillQuery = `
    UPDATE bills
    SET 
      title='${title}',
      amount='${amount}',
      due_day='${due_day}',
      reminder_time='${reminder_time}',
      phone='${phone}',
      message='${message}'
    WHERE id='${id}';
  `

  try {
    await db.execute(updateBillQuery)
    response.status(200).send('Bill updated successfully')
  } catch {
    response.status(500).send('Error updating bill')
  }
})

// DELETE BILL API

app.delete('/bills/:id', async (request, response) => {

  const {id} = request.params

  let deleteBillQuery = `
    DELETE FROM bills
    WHERE id='${id}';
  `

  try {
    await db.execute(deleteBillQuery)
    response.status(200).send('Bill deleted successfully')
  } catch {
    response.status(500).send('Error deleting bill')
  }
})

// CRON SCHEDULAR

cron.schedule("* * * * *", async () => {
  try {

    console.log(`cron tick : ${new Date()}`)

    const now = new Date()

    const todayDay = now.getDate()
    const currentTime = now.toTimeString().slice(0,5)
    const monthKey = now.toISOString().slice(0,7)

    let [bills] = await db.execute(`
      SELECT *
      FROM bills
      WHERE due_day='${todayDay}'
      AND reminder_time='${currentTime}'
      AND (last_notified_month IS NULL OR last_notified_month!='${monthKey}')
    `)

    for (let bill of bills) {

      let message = `Reminder
      Bill: ${bill.title}
      Amount: ₹${bill.amount}
      Due Today`

      await sendWhatsApp(bill.phone, message)

      await db.execute(`
        UPDATE bills
        SET last_notified_month='${monthKey}'
        WHERE id='${bill.id}'
      `)

      console.log("Sent:", bill.title)
    }

  } catch (error) {
    console.log("Cron Error:", error.message)
  }
})

