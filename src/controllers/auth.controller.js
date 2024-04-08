import { prisma } from "../db.js";
import bcrypt from "bcryptjs";
import { createAccessToken } from "../libs/jwt.js";
import jwt from "jsonwebtoken";
import { TOKEN_SECRET } from "../conf/config.js";

export const register = async (req, res) => {
  const { username, email, password } = req.body;

  try {
    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        username,
        email,
        password: passwordHash,
      },
    });

    // Assign role and internal sector to user on register (default values)
    const [role, internalSec] = await prisma.$transaction([
      prisma.role.findFirst({
        where: {
          name: "ejecutor",
        },
      }),
      prisma.internalSec.findFirst({
        where: {
          name: "Guest",
        },
      }),
    ]);

    await prisma.$transaction([
      prisma.userRole.create({
        data: {
          roleId: role.id,
          userId: user.id,
        },
      }),
      prisma.userInternalSec.create({
        data: {
          internalSecId: internalSec.id,
          userId: user.id,
        },
      }),
    ]);

    const accessToken = await createAccessToken({ id: user.id });
    res.cookie("access-token", accessToken, {
      httpOnly: true,
      sameSite: "none",
      secure: true,
    });

    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const login = async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await prisma.user.findUnique({
      where: {
        email,
      },
      include: {
        role: {
          select: {
            role: true,
          },
        },
        internalSec: {
          select: {
            internalSecId: true,
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      return res.status(401).json({ error: "Invalid password" });
    }

    const accessToken = await createAccessToken({
      id: user.id,
      role: user.role,
      internalSec: user.internalSec[0].internalSecId,
    });
    res.cookie("access-token", accessToken, {
      httpOnly: true,
      sameSite: "none",
      secure: true,
    });

    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const logout = async (req, res) => {
  res.cookie("access-token", "", {
    httpOnly: true,
    sameSite: "none",
    secure: true,
    expires: new Date(0),
  });
  res.json({ message: "Logged out" });
};

export const profile = async (req, res) => {
  const token = req.cookies["access-token"];

  if (!token) {
    return res.status(401).json({ error: "User not authenticated" });
  }

  try {
    const payload = jwt.verify(token, TOKEN_SECRET);

    const user = await prisma.user.findUnique({
      where: {
        id: payload.id,
      },
      select: {
        id: true,
        username: true,
        email: true,
        role: {
          select: {
            role: true,
          },
        },
      },
    });

    res.json(user);
  } catch (error) {
    res.status(401).json({ error: error.message });
  }
};

export const verifyToken = async (req, res) => {
  const token = req.cookies["access-token"];

  if (!token) {
    return res.status(401).json({ error: "User not authenticated" });
  }

  try {
    const payload = jwt.verify(token, TOKEN_SECRET);

    res.json(payload);
  } catch (error) {
    res.status(401).json({ error: "User not authenticated" });
  }
};
