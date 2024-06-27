Parse.Cloud.define("getUserId", async (request) => {
    const { objectId, stat } = request.params;

    const userQuery = new Parse.Query(Parse.User);
   
    try {
        const user = await userQuery.get(objectId, { useMasterKey: true });

        if (user) {
            user.set('stat', stat);
          }

          // Save the user object with the changes
         await user.save(null, { useMasterKey: true });
  
      return {
        message: 'User information updated successfully',
        updatedUser: user.toJSON()
      };
    }  catch(e) {
        throw new Error('Error updating user information.');
    }

})