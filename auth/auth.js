const router = require("express").Router();

router.post("/godot", async (req, res) => {
    console.log("request from godot")
    res.status(200).json({
        m: "ss"
    })
})

//create acount
router.post("/register", async (req, res) => {
   console.log("register post request from godot")
  
   const { username, email, password } = req.body
 
    const newData = {
    level: 0, 
    baseExp: 100,
    exp: 0,
    energy: 20
    }

    const user = new Parse.User();

    user.set("username", username);
    user.set("email", email);
    user.set("password", password);
    user.set("stat", newData)

    try {
        await user.signUp();
        res.status(200).json({
            user,
            message: "User created successfully!"
        });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});



// login 
router.post("/login", async (req, res) => {
    console.log("login post request from godot")
    const { username, password } = req.body;
  
     
     const user = new Parse.User()
     user.set("username", username);
     user.set("password", password);
    
 
     try {
         await user.logIn();

        const { email, stat} = user
        const name = user.username

         res.status(200).json({
             user,
             message: "User logged in successfully!"
         });
         
     } catch (error) {
         res.status(500).json({ error: error.message });
     }
 });


 router.post("/update", async (req, res) => {
    console.log("update request from godot")
        const {objectId, stat }= req.body
       
        try {
            const user = new Parse.Cloud.run("getUserId", { objectId, stat })
            res.status(200).json({ message: "user updated successfuly!"});
        } catch (error) {
            console.error('Error fetching user:', error);
            throw error;
        }
 })

module.exports = router