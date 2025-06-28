// const {validationResult} = require('express-validator');
const {User} = require('../models/user');
const bcrypt = require('bcrypt');
// const randomstring = require('randomstring');
// const {sendMail} = require('../helper/mailer');
// const mongoose = require('mongoose');
// const {Permissions} = require('../models/permissions');
// const {Roles} = require('../models/roles')
const db = require('../db');

const createUser = async (req, res) => {
    try {
        const { name, email, phone, password, role_id } = req.body;
        if (!name || !email || !phone || !password) {
            return res.status(400).json({ success: false, msg: 'Missing required fields' });
        }
        // Kiểm tra email đã tồn tại
        const [existRows] = await db.promise().query('SELECT id FROM users WHERE email = ?', [email]);
        if (existRows.length > 0) {
            return res.status(400).json({ success: false, msg: 'Email already exists!' });
        }
        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);
        // Thêm user
        const [result] = await db.promise().query(
            'INSERT INTO users (name, email, phone, password, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NOW(), NOW())',
            [name, email, phone, hashedPassword, 'active']
        );
        // Gán role nếu có
        if (role_id) {
            await db.promise().query(
                'INSERT INTO user_roles (user_id, role_id, is_active) VALUES (?, ?, TRUE)',
                [result.insertId, role_id]
            );
        }
        res.status(201).json({ success: true, msg: 'User created successfully!' });
    } catch (error) {
        res.status(500).json({ success: false, msg: 'Server error', error: error.message });
    }
};

// Lấy danh sách user
const getAllUsers = async (req, res) => {
    try {
        const [rows] = await db.promise().query(
            `SELECT u.id, u.name, u.email, u.phone, u.status, u.created_at, u.updated_at,
                GROUP_CONCAT(r.name) as roles
            FROM users u
            LEFT JOIN user_roles ur ON u.id = ur.user_id AND ur.is_active = TRUE
            LEFT JOIN roles r ON ur.role_id = r.id
            GROUP BY u.id`
        );
        res.status(200).json({ success: true, data: rows });
    } catch (error) {
        res.status(500).json({ success: false, msg: 'Server error', error: error.message });
    }
};

// Lấy chi tiết user
const getUserById = async (req, res) => {
    try {
        const userId = req.params.id;
        const [rows] = await db.promise().query(
            `SELECT u.id, u.name, u.email, u.phone, u.status, u.created_at, u.updated_at,
                GROUP_CONCAT(r.name) as roles
            FROM users u
            LEFT JOIN user_roles ur ON u.id = ur.user_id AND ur.is_active = TRUE
            LEFT JOIN roles r ON ur.role_id = r.id
            WHERE u.id = ?
            GROUP BY u.id`,
            [userId]
        );
        if (rows.length === 0) {
            return res.status(404).json({ success: false, msg: 'User not found' });
        }
        res.status(200).json({ success: true, data: rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, msg: 'Server error', error: error.message });
    }
};

const checkIsOwnerOrAdmin = (reqUser, targetUser) => {
    if (!reqUser || !targetUser) return false;
    if (reqUser._id.toString() === targetUser._id.toString()) return true;
    if (reqUser.roles && reqUser.roles.some(role => role.name === 'Admin' || role.name === 'admin')) return true;
    return false;
};

// Cập nhật user
const updateUser = async (req, res) => {
    try {
        const userId = req.params.id;
        const { name, email, phone, status, password, role_id } = req.body;
        // Cập nhật thông tin cơ bản
        await db.promise().query(
            'UPDATE users SET name = ?, email = ?, phone = ?, status = ?, updated_at = NOW() WHERE id = ?',
            [name, email, phone, status, userId]
        );
        // Nếu có password mới
        if (password) {
            const hashedPassword = await bcrypt.hash(password, 10);
            await db.promise().query('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, userId]);
        }
        // Nếu có role mới
        if (role_id) {
            // Vô hiệu hóa các role cũ
            await db.promise().query('UPDATE user_roles SET is_active = FALSE WHERE user_id = ?', [userId]);
            // Gán role mới
            await db.promise().query('INSERT INTO user_roles (user_id, role_id, is_active) VALUES (?, ?, TRUE)', [userId, role_id]);
        }
        res.status(200).json({ success: true, msg: 'User updated successfully!' });
    } catch (error) {
        res.status(500).json({ success: false, msg: 'Server error', error: error.message });
    }
};

// Xoá user
const deleteUser = async (req, res) => {
    try {
        const userId = req.params.id;
        await db.promise().query('DELETE FROM users WHERE id = ?', [userId]);
        res.status(200).json({ success: true, msg: 'User deleted successfully!' });
    } catch (error) {
        res.status(500).json({ success: false, msg: 'Server error', error: error.message });
    }
};

// Gán vai trò cho user
const assignRole = async (req, res) => {
    try {
        const userId = req.params.id;
        const { role_id } = req.body;
        if (!role_id) return res.status(400).json({ success: false, msg: 'Missing role_id' });
        await db.promise().query('INSERT INTO user_roles (user_id, role_id, is_active) VALUES (?, ?, TRUE)', [userId, role_id]);
        res.status(200).json({ success: true, msg: 'Role assigned' });
    } catch (error) {
        res.status(500).json({ success: false, msg: 'Server error', error: error.message });
    }
};

// Xoá vai trò khỏi user
const removeRole = async (req, res) => {
    try {
        const userId = req.params.id;
        const { role_id } = req.body;
        if (!role_id) return res.status(400).json({ success: false, msg: 'Missing role_id' });
        await db.promise().query('UPDATE user_roles SET is_active = FALSE WHERE user_id = ? AND role_id = ?', [userId, role_id]);
        res.status(200).json({ success: true, msg: 'Role removed' });
    } catch (error) {
        res.status(500).json({ success: false, msg: 'Server error', error: error.message });
    }
};

module.exports = {
    createUser,
    getAllUsers,
    updateUser,
    deleteUser,
    getUserById,
    assignRole,
    removeRole
}