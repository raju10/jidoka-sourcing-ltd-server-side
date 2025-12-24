const express = require("express");
const app = express();
const cors = require("cors");
const jwt = require("jsonwebtoken");
const port = process.env.PORT || 4000;
//important
require("dotenv").config();
// const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
// middleWare
app.use(cors());
app.use(express.json());
//////////////////////////////

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.svkeerx.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    /////////curd work now/////////////
    const categoryCollection = client.db("jidokaDb").collection("category");
    const subCategoryCollection = client
      .db("jidokaDb")
      .collection("subCategory");
    const productCollection = client.db("jidokaDb").collection("product");
    const cartCollection = client.db("jidokaDb").collection("carts");
    const userCollection = client.db("jidokaDb").collection("users");

    // jwt related api
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1h",
      });
      res.send({ token });
    });
    // middlewares
    const verifyToken = (req, res, next) => {
      console.log("inside verify token", req.headers);
      if (!req.headers.authorization) {
        return res.status(401).send({ message: "Unauthorized access" });
      }
      const token = req.headers.authorization.split(" ")[1];

      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        console.log("56 no line===========", decoded);
        console.log("57 no line err===========", err);
        if (err) {
          return res.status(401).send({ message: "Unauthorized access" });
        }
        req.decoded = decoded;
        next();
      });
    };
    ///use verifyAdmin after verifyToken///
    const varifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === "Admin";
      if (!isAdmin) {
        return res.status(403).send({ message: "Forbidden access" });
      }
      next();
    };
    // users related api

    app.get("/users", verifyToken, varifyAdmin, async (req, res) => {
      //  console.log("67 no line =========", req.headers);
      const result = await userCollection.find().toArray();
      res.send(result);
    });
    // isAdmin varify
    app.get("/users/admin/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "Forbidden access" });
      }
      const query = { email: email };
      const user = await userCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === "Admin";
      }
      res.send({ admin });
    });
    //post
    app.post("/users", async (req, res) => {
      const user = req.body;
      // inser email if user doesn't exists:
      // you can do tghis many ways (1. email unique, 2. upsert, 3.simple checkinh)
      const query = { email: user.email };
      const existingUser = await userCollection.findOne(query);
      console.log("46 no line ====", existingUser);
      if (existingUser) {
        return res.send({ message: "User alredy exists", insertedId: null });
      }
      ///////////
      const result = await userCollection.insertOne(user);
      console.log("43 no line ====", result);
      res.send(result);
    });

    // user role update
    app.patch(
      "/users/admin/:id",
      verifyToken,
      varifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const updatedDoc = {
          $set: {
            role: "Admin",
          },
        };
        const result = await userCollection.updateOne(filter, updatedDoc);
        res.send(result);
      }
    );
    // app.patch("/users/admin/:id", async (req, res) => {
    //   const id = req.params.id;
    //   const filter = { _id: new ObjectId(id) };

    //   try {
    //     // find current user
    //     const user = await userCollection.findOne(filter);
    //     if (!user) return res.status(404).send({ message: "User not found" });

    //     // toggle role
    //     const newRole = user.role === "Admin" ? "User" : "Admin";

    //     const updatedDoc = { $set: { role: newRole } };
    //     const result = await userCollection.updateOne(filter, updatedDoc);

    //     res.send(result);
    //   } catch (error) {
    //     console.error("Role toggle error:", error);
    //     res.status(500).send({ message: "Internal server error" });
    //   }
    // });

    //////////
    app.delete("/users/:id", verifyToken, varifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await userCollection.deleteOne(query);
      res.send(result);
    });

    // ////////////some work/////////////////////////////

    // Mark product as contacted by user
    app.post("/users/contact/:productId", async (req, res) => {
      try {
        const { productId } = req.params;
        const { userEmail, userMessage } = req.body;
        console.log("userEmail,   userMessage====>>>>", userEmail, userMessage);
        if (!productId || !userEmail || !userMessage) {
          return res.status(400).send({ message: "Missing data" });
        }

        const user = await userCollection.findOne({ email: userEmail });
        if (!user) return res.status(404).send({ message: "User not found" });

        if (!user.contactedProducts) user.contactedProducts = [];

        if (user.contactedProducts.includes(productId, userMessage)) {
          return res.status(200).send({ alreadyContacted: true });
        }

        user.contactedProducts.push({
          productIdOrMessage: {
            productId,
            userMessage,
          },
        });
        await userCollection.updateOne(
          { email: userEmail },
          { $set: { contactedProducts: user.contactedProducts } }
        );

        res.status(200).send({ success: true });
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Server error" });
      }
    });

    // Check if user already contacted product
    // app.get("/users/contact/status/:productId", async (req, res) => {
    //   try {
    //     const { productId } = req.params;
    //     const { email } = req.query;

    //     if (!email || !productId)
    //       return res.status(400).send({ message: "Missing data" });

    //     const user = await userCollection.findOne({ email });
    //     if (!user) return res.status(404).send({ message: "User not found" });

    //     const isSent = user.contactedProducts?.includes(productId) || false;
    //     res.status(200).send({ isSent });
    //   } catch (err) {
    //     console.error(err);
    //     res.status(500).send({ message: "Server error" });
    //   }
    // });
    app.get("/users/contact/status/:productId", async (req, res) => {
      try {
        const { productId } = req.params;
        const { email } = req.query;

        if (!email || !productId)
          return res.status(400).send({ message: "Missing data" });

        const user = await userCollection.findOne({ email });
        if (!user) return res.status(404).send({ message: "User not found" });
        // Find the contact object for this product
        const contactObj = user.contactedProducts?.find(
          (item) => item.productIdOrMessage.productId === productId
        );

        res.status(200).send({
          isSent: !!contactObj, // true if already contacted
          userMessage: contactObj?.productIdOrMessage.userMessage || "", // send message if needed
        });
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Server error" });
      }
    });

    ////////////////////////////////

    // category related api

    app.post("/category", async (req, res) => {
      const categoryItems = req.body;
      const result = await categoryCollection.insertOne(categoryItems);
      console.log(result);
      res.send(result);
    });
    app.get("/category", async (req, res) => {
      const result = await categoryCollection.find().toArray();
      res.send(result);
    });

    app.get("/test", (req, res) => {
      res.send("testing");
    });
    // sub-category related api

    app.post("/subCategory", async (req, res) => {
      const subCategoryItem = req.body;
      const result = await subCategoryCollection.insertOne(subCategoryItem);
      console.log(result);
      res.send(result);
    });
    app.get("/subCategory", async (req, res) => {
      const result = await subCategoryCollection.find().toArray();
      res.send(result);
    });
    // Product-sub-category related api

    app.post("/product", async (req, res) => {
      const productItem = req.body;
      const result = await productCollection.insertOne(productItem);
      console.log(result);
      res.send(result);
    });
    app.get("/product", async (req, res) => {
      const result = await productCollection.find().toArray();
      res.send(result);
    });

    // carts related api

    app.post("/carts", async (req, res) => {
      const cartItems = req.body;

      const result = await cartCollection.insertOne(cartItems);
      console.log("78 no line  =====", result);
      res.send(result);
    });
    app.get("/carts", async (req, res) => {
      const email = req.query.email;
      const query = { "user.email": email };
      const result = await cartCollection.find(query).toArray();
      console.log("85 line result===", result);
      res.send(result);
    });
    app.delete("/carts/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await cartCollection.deleteOne(query);
      console.log("92 no line===", result);
      res.send(result);
    });
    app.patch("/carts/:id", async (req, res) => {
      const { id } = req.params;
      const { noOfProduct, totalCalculatePrice } = req.body;
      console.log("98 no line===>", id, noOfProduct, totalCalculatePrice);
      const result = await cartCollection.updateOne(
        {
          _id: new ObjectId(id),
        },
        {
          $set: {
            noOfProduct: noOfProduct,
            totalCalculatePrice: totalCalculatePrice,
          },
        }
      );
      console.log("109 no line =====>>>>", result);
      res.send(result);
    });
    // payment intent

    // app.post("/create-payment-intent", async (req, res) => {
    //   const { price } = req.body;
    //   const amount = parseInt(price * 100);

    //   const paymentIntent = await stripe.paymentIntents.create({
    //     amount: amount,
    //     currency: "usd",
    //     payment_method_types: ["card"],
    //   });
    //   console.log("amount inside the intant===", amount, paymentIntent);
    //   res.send({
    //     clientSecret: paymentIntent.client_secret,
    //   });
    // });
    //////////////////////

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

//////////////////////////////////
app.get("/", (req, res) => {
  res.send("jidoka surver runningggg");
});

app.listen(port, () => {
  console.log(`jidoka is sitting on port ${port}`);
});
