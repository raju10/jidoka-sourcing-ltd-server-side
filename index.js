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

// Database Collections
let categoryCollection;
let subCategoryCollection;
let productCollection;
let cartCollection;
let userCollection;

// Middleware to ensure DB is connected before handling requests
const ensureDbConnection = async (req, res, next) => {
  try {
    // If collections are already initialized, we can skip connection check (optimization)
    if (userCollection) {
      return next();
    }

    await client.connect();
    const db = client.db("jidokaDb");

    categoryCollection = db.collection("category");
    subCategoryCollection = db.collection("subCategory");
    productCollection = db.collection("product");
    cartCollection = db.collection("carts");
    userCollection = db.collection("users");

    console.log("Connected to MongoDB established via middleware");
    next();
  } catch (error) {
    console.error("Failed to connect to MongoDB", error);
    res
      .status(500)
      .send({ message: "Database connection failed", error: error.message });
  }
};

// Apply middleware to all routes except the health check if desired,
// but for simplicity, apply to all.
app.use(ensureDbConnection);

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
  const query = { email: user.email };
  const existingUser = await userCollection.findOne(query);
  if (existingUser) {
    return res.send({ message: "User alredy exists", insertedId: null });
  }
  const result = await userCollection.insertOne(user);
  res.send(result);
});

// user role update
app.patch("/users/admin/:id", verifyToken, varifyAdmin, async (req, res) => {
  const id = req.params.id;
  const filter = { _id: new ObjectId(id) };
  const updatedDoc = {
    $set: {
      role: "Admin",
    },
  };
  const result = await userCollection.updateOne(filter, updatedDoc);
  res.send(result);
});

app.delete("/users/:id", verifyToken, varifyAdmin, async (req, res) => {
  const id = req.params.id;
  const query = { _id: new ObjectId(id) };
  const result = await userCollection.deleteOne(query);
  res.send(result);
});

// Mark product as contacted by user
app.post("/users/contact/:productId", async (req, res) => {
  try {
    const { productId } = req.params;
    const { userEmail, userMessage } = req.body;
    if (!productId || !userEmail || !userMessage) {
      return res.status(400).send({ message: "Missing data" });
    }

    const user = await userCollection.findOne({ email: userEmail });
    if (!user) return res.status(404).send({ message: "User not found" });

    if (!user.contactedProducts) user.contactedProducts = [];

    const alreadyExists = user.contactedProducts.some(
      (item) => item.productIdOrMessage.productId === productId
    );

    if (alreadyExists) {
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

app.get("/users/contact/status/:productId", async (req, res) => {
  try {
    const { productId } = req.params;
    const { email } = req.query;

    if (!email || !productId)
      return res.status(400).send({ message: "Missing data" });

    const user = await userCollection.findOne({ email });
    if (!user) return res.status(404).send({ message: "User not found" });

    const contactObj = user.contactedProducts?.find(
      (item) => item.productIdOrMessage.productId === productId
    );

    res.status(200).send({
      isSent: !!contactObj,
      userMessage: contactObj?.productIdOrMessage.userMessage || "",
    });
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Server error" });
  }
});

// category related api
app.post("/category", async (req, res) => {
  const categoryItems = req.body;
  const result = await categoryCollection.insertOne(categoryItems);
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
  res.send(result);
});

app.get("/carts", async (req, res) => {
  const email = req.query.email;
  const query = { "user.email": email };
  const result = await cartCollection.find(query).toArray();
  res.send(result);
});

app.delete("/carts/:id", async (req, res) => {
  const id = req.params.id;
  const query = { _id: new ObjectId(id) };
  const result = await cartCollection.deleteOne(query);
  res.send(result);
});

app.patch("/carts/:id", async (req, res) => {
  const { id } = req.params;
  const { noOfProduct, totalCalculatePrice } = req.body;
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
  res.send(result);
});

app.get("/", (req, res) => {
  res.send("jidoka surver runningggg");
});

// IMPORTANT for Vercel: Export the app
module.exports = app;

// Only listen if not running as a Vercel function
if (process.env.NODE_ENV !== "production") {
  app.listen(port, () => {
    console.log(`jidoka is sitting on port ${port}`);
  });
}
