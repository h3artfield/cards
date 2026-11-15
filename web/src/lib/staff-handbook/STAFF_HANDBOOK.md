# The Game Lodge staff handbook

This is the procedure book for store employees using Card Scanner. Answer a how-to question from the matching article. If no article covers the question, say so. Do not invent a button, a menu, or a click path.

The signed-in store app has five tabs: **Orders**, **Pricing**, **Register**, **Reports**, and **Settings**. A search box sits under the store name on every one of those screens.

---

## The staff search box

Questions: where is search, how do I find a customer, how do I open an account, how do I get to sales, where is the register.

The search box is at the top of every store screen, under the store name.

- Type a customer’s name, email, or phone. Click the person to open their account under **Reports → Customers**, including trade credit.
- Type a page, such as sale, inventory, shipping, pricing, or orders. Click the match to go there. Sale opens the **Register**.
- Ask a how-to question, such as “how do I add a card?”. The answer comes from this handbook. If this handbook does not cover it, the box says so.

Two kinds of stock exist, and they are not the same screen:

- **Catalog stock** comes from **Add cards** or a TCGplayer import. It shows on the inventory sheet and on the public inventory page.
- **Buyback stock** comes from a completed customer order. It can be sold at the **Register**. It does not appear on the inventory sheet.

Shopify products that were already in the shop — sealed product, sleeves, deck boxes, paints, Warhammer, and the rest — are not managed from these inventory tools.

---

## Sign in and sign out

Questions: how do I log in, I got logged out, where is the password, how do I sign out.

1. Open the store login page (`/store/login`).
2. Sign in with the store email and password.
3. The app opens on **Orders**.
4. **Sign out** is at the top right.

A store owner changes their own email or password under **Settings**, in **Your account**. Employees do not reset another person’s password from the counter screens.

---

## Where things are

Questions: where do I go, what tab do I use, I can’t find it.

| I need to… | Open |
|---|---|
| See a customer’s buyback | **Orders** |
| Change what we pay for cards | **Pricing** |
| Sell a card at the counter | **Register** |
| See or edit the shelf, import a file, or run a report | **Reports** |
| QR code, store name, Shopify connection, calendar | **Settings** |

**Reports** has four sections: **Overview**, **Customers**, **Inventory**, and **Shipping**.

**Inventory** has three views: **On hand**, **Sold**, and **Purchases**.

---

## Start a buyback

Questions: how does a customer sell us cards, where is the QR code, how do they scan.

The store does not type a new buyback from scratch. The customer starts it.

1. On **Settings**, show or print the store QR code.
2. The customer scans it and signs in on their phone.
3. They photograph the cards. The order appears on **Orders**, under **Open**.
4. The order number stays grey while cards are still processing. It becomes a link when the status is ready for review.
5. Open that order number.

If **Orders** says **No orders yet**, no customer has scanned the QR. The code is on **Settings**.

---

## Review a buyback

Questions: how do I accept a card, how do I reject a card, the price looks wrong, how do I remove a card.

On the open order, each card has:

- **Yes** — we are buying it. It counts toward the total.
- **No** — we are not buying it.
- **Edit** — change the offer or the card details, then **Save**.
- **Feedback** — note a problem with the identification.
- **Remove** — take the card off the order.

The bar at the bottom is the running total. It shows how many cards are included, the market total, and the cash and trade totals. At least one card must be **Yes** before the order can be paid.

**Cash** and **Trade** stay disabled until a card is marked **Yes**.

---

## Pay a buyback

Questions: how do I finish a buy order, cash or trade, where does the credit go, do the cards enter inventory.

1. Mark every card we are buying as **Yes**.
2. Check the bottom bar.
3. Press **Cash** and the dollar amount to pay cash.
4. Press **Trade** and the dollar amount to pay store credit instead.

Cash pays the customer that amount and closes the order. Trade adds that amount to the customer’s trade credit and closes the order.

Either way, each **Yes** card is stored as inventory and can be sold later at the **Register**. The order moves to **Orders → Closed**. Closed orders are filtered by the **Completed on** date.

---

## Cancel or reopen a buyback

Questions: the customer changed their mind, I finished the wrong order, how do I undo a payout.

On an open order, **Cancel sale** is on the bottom bar. Confirm it. No cards are purchased.

On a finished order, the bar says **Finalized**. Press **Reopen order** and enter your name. Trade credit that was issued for that order is reversed. Do this when the payout was a mistake, not as a normal return of a later retail sale.

---

## See today’s buybacks

Questions: where are finished orders, how much did we spend today.

1. Open **Orders**.
2. Choose **Closed**.
3. Set **Completed on** to the day, or tap one of the recent day chips.
4. The row shows the customer, card count, market, and what was paid.

**Reports → Inventory → Purchases** is the longer purchase history. **Reports → Overview → Generate report** builds a store-wide summary of buying trends.

---

## Sell a card at the counter

Questions: how do I ring something up, register, in-store sale, the customer is standing here.

1. Open **Register**.
2. Under **Ring up a sale**, search **Find a card** by name, set, or SKU.
3. Tap the card. The price and quantity on hand are on the right.
4. Change **Qty** on the line if they are buying more than one. The quantity cannot pass what is on hand.
5. Leave **Customer** on **Walk-in — cash or card** unless they are spending trade credit.
6. Check **Due now**.
7. Press **Complete sale**.

The sale marks those copies sold and updates the quantity on Shopify when that card is listed there. The ticket appears under **Recent tickets**.

Search for a card to start a ticket means the ticket is still empty.

---

## Spend trade credit

Questions: how much credit does this customer have, how do I apply credit, they want to use store credit.

On the **Register**:

1. Choose the customer in **Customer (optional)**. Walk-in cannot spend credit.
2. The line under the box shows how much credit is available.
3. Enter an amount in **Trade credit to apply**, or press **Use max**.
4. **Due now** is the subtotal minus the credit. Leftover credit stays on the account.
5. Press **Complete sale**.

To look up the history without ringing a sale, open **Reports → Customers**, click the customer, and read the credit entries. Issued credit names the buyback order. Spent credit is a register sale.

Customers get an account when they scan the store QR. There is no separate “create customer” button on the register.

---

## Read the inventory sheet

Questions: where is the spreadsheet, how do I see what we have, how do I search the back stock.

1. Open **Reports → Inventory**.
2. Stay on **On hand**.
3. The sheet is under the import boxes. Search by name, set, ID, or condition.
4. **All stock**, **In stock only**, and **Catalog @ 0 qty** change which rows show.
5. **Listed (Shopify)** and **Not listed** filter by whether a Shopify product exists.
6. **Foils** and **Nonfoil** filter finish.

Columns that can be shown or hidden are image, name, set, number, finish, condition, quantity, and price. The name column stays. Column choices last for this visit only.

The sheet lists catalog stock: TCGplayer imports and cards added with **Add cards**. Buyback purchases are not on this sheet. Sell those at the **Register**.

**Sold** is the list of copies already sold. **Purchases** is buyback payout history.

---

## Change a name, condition, quantity, or price

Questions: how do I edit a card, fix a price, change quantity, the condition is wrong.

On the **On hand** sheet:

- **Name**, **condition**, **quantity**, and **price** can be edited.
- **Set**, **number**, and **finish** cannot. Those identify the printing.
- Click the cell, change it, and click away. It saves on blur.
- Enter leaves the cell and saves. Escape puts the old value back.
- An empty price or a blank quantity is not saved.
- Quantity must be a whole number from 0 to 9999. Price cannot be negative.

The public inventory page uses the name, condition, quantity, and price saved here. Shopify checkout still charges the last price that was exported to Shopify. Changing the sheet price does not change the Shopify price until that listing is exported again.

Quantity 0 hides the card from the public inventory page. It does not delete the row, and it does not take down a Shopify product.

---

## Add one card

Questions: how do I add a card, we opened a pack, someone traded a card at the counter, it was never on a spreadsheet.

Use this for one printing. A whole TCGplayer file uses the import below, not this form.

1. Open **Reports → Inventory → On hand**.
2. Press **Add cards**.
3. Type the card name, for example Lightning Bolt, and press **Search**.
4. Tap the correct printing. Check the set and collector number.
5. Set **Condition**, **quantity**, and **price**.
6. Add the card.
7. Press **Done** when finished.

The new row is catalog stock. It shows on the sheet and on the public inventory page. It is not on Shopify until it is listed from **Push imported inventory to Shopify**.

---

## Import a TCGplayer file

Questions: how do I upload inventory, how do I update quantities from TCGplayer, where do I export the file.

1. In the TCGplayer seller portal, export the full inventory.
2. In the app, open **Reports → Inventory → On hand**.
3. Use **Import / update from TCGplayer CSV**.
4. Choose the file and press **Preview import**.
5. Read the preview. **Create** is new, **update** is a change, **withdraw** means a row in the app is missing from the file.
6. If a red withdrawal warning appears, check the file before confirming. A large withdrawal means many cards in the app are absent from this file.
7. Apply the import.

Prices come from **My Store Price**. Quantities come from **Total Quantity**. Rows are matched by TCGplayer id and condition.

A file only updates the product lines it names. A blank file updates nothing. Do not upload a blank file to clear the shelf.

After apply, the app tries to fetch card art. Some sealed or unknown SKUs can remain without a picture.

Re-importing updates prices and quantities on listings that already exist on Shopify. It does not create new Shopify products by itself, and it does not change sealed product, sleeves, or boxes that were never in the file.

---

## Put catalog stock on Shopify

Questions: how do I list cards on the website, the card is in the app but not on Shopify, checkout price is wrong.

1. Open **Reports → Inventory → On hand**.
2. Find **Push imported inventory to Shopify**.
3. **Ready to list** can be created. **Already on Shopify** already has a product.
4. Press **List next** to create a batch. If more remain, run it again, or start the full run under that button.

A row is skipped when it has no price, no quantity, or is withdrawn. Checkout uses the Shopify price from the last export. Edit the sheet, then export again, when the online price must change.

This push creates products only for imported and manually added catalog rows. It does not edit the shop’s existing sealed product, sleeves, deck boxes, or other non-card products.

Cards purchased on a buyback order are separate. When any of those are still on hand, **Shopify export** appears on the same page. Select the cards and create the drafts from there.

---

## The public inventory page

Questions: what do customers see, where is the singles page, why can they add it to a cart, the picture is blank.

Customers browse `https://cardscanner9000.com/s/the-game-lodge/inventory`.

That page shows catalog stock with a quantity above 0. A card from the full card catalog, rather than the store’s shelf, can be viewed and cannot be added to the cart.

Tapping an in-stock card adds it to the cart at the shelf price. Checkout opens Shopify, and Shopify charges the last exported price.

The **Singles** item on the shop menu still goes to TCGplayer until that menu item is changed. The inventory page and the Shopify shop are both live. They are not the same link yet.

A missing picture is a catalog match problem, not a sign that the card is out of stock. **Cache all to storage** and **Retry missed images** on the inventory page store art for rows that already have a match.

---

## Customers

Questions: who has an account, how do I find a customer, when did they join.

Open **Reports → Customers**. Each row is the name, email, phone, and join date. Open the row for trade-credit history.

Accounts are created when a customer scans the store QR and signs up. The register cannot create an account by typing a name.

---

## Shipping labels

Questions: how do I print a TCGplayer shipping label, how do I send tracking back.

Open **Reports → Shipping**. Three tools:

- **TCG → USPS** turns a TCGplayer shipping export into a USPS file. The sender address has to be filled in before the file will build.
- **Address labels** builds a label file from the same orders.
- **Tracking → TCG** takes the tracking results and builds the file to upload back to TCGplayer.

This is for mailed TCGplayer orders. A counter sale at the **Register** does not go through here.

---

## What we pay for cards

Questions: how do I change cash percent, trade percent, condition, why was this offer low.

Open **Pricing**.

- **Rules** are the store’s buying rules. Save a rule from that section.
- **Buy %** is **Default cash %**, **Default trade %**, slab cash and trade percents, **Manual review threshold ($)**, and **Minimum offer ($)**. Press **Save**.
- **Conditions** are the multipliers for Near Mint, Lightly Played, Moderately Played, Heavily Played, and Damaged.
- **Providers** chooses where the market price comes from.

Those numbers are used the next time a buyback is priced. They do not rewrite a Shopify shelf price.

**V2 Knowledge**, **V2 review**, and **Staff queue** are identification tools. They are not the counter payout screen. Daily yes/no decisions happen on the order.

---

## Store settings, QR, and the calendar

Questions: how do I change the store name, where is the QR, how do I add an event.

**Settings** holds:

- The event calendar embed.
- The store QR code. Customers use it to start a buyback and to create an account.
- The logo upload.
- **Store details**: store name, URL slug, email notifications, and SMS. Press **Save store settings**. The slug is the public address `/s/` plus that slug. The Game Lodge slug is `the-game-lodge`.
- The Shopify connection.
- **Your account**, for the owner’s email and password.

The event calendar is also opened from Settings. Click a day to add an event. Open an event and use the **Signups** tab to see who registered and which Commander decks they are bringing. **Published** means customers can see it. **Draft** means they cannot. Save the publish setting before leaving.

---

## What this app will not do

Questions: how do I delete every card, how do I remove sleeves, the spreadsheet is wrong, can I wipe Shopify.

There is no delete button on an inventory row. Quantity 0 hides a catalog card from the public page and leaves the row in place.

A blank TCGplayer file does not clear the shelf.

Sealed product, sleeves, deck boxes, paints, and other products that were created in Shopify itself stay there. Import, the inventory sheet, and the catalog push do not remove them.

Clearing imported singles is a separate job. It is not something to do from the sheet, one row at a time, or with an empty file.

---

## If the answer is not in this book

Say that this handbook does not cover that step. Do not guess a menu. Ask a manager, or ask for the handbook to be updated.
